const yahooSymbols = new Set([
  "^DJI",
  "^IXIC",
  "^GSPC",
  "^VIX",
  "GC=F",
  "SI=F",
  "HG=F",
  "CL=F",
  "^KS11",
  "^KQ11",
]);

function send(res, status, payload, contentType = "application/json; charset=utf-8") {
  res.statusCode = status;
  res.setHeader("Content-Type", contentType);
  res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=300");
  res.end(typeof payload === "string" ? payload : JSON.stringify(payload));
}

async function fetchYahoo(symbol) {
  if (!yahooSymbols.has(symbol)) {
    throw new Error("지원하지 않는 Yahoo 심볼입니다.");
  }

  const response = await fetch(
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=5d&interval=15m`,
    { headers: { "User-Agent": "Mozilla/5.0" } },
  );

  if (!response.ok) {
    throw new Error(`${symbol} 데이터를 불러오지 못했습니다.`);
  }

  const result = (await response.json()).chart?.result?.[0];
  const closes = result?.indicators?.quote?.[0]?.close ?? [];
  const timestamps = result?.timestamp ?? [];
  const previousClose = result?.meta?.chartPreviousClose;
  const points = closes
    .map((value, index) => ({
      date: timestamps[index] * 1000,
      value: Number(value),
    }))
    .filter((point) => Number.isFinite(point.date) && Number.isFinite(point.value));

  if (points.length < 2) {
    throw new Error(`${symbol} 차트 데이터가 부족합니다.`);
  }

  return {
    points,
    previous: Number.isFinite(previousClose) ? previousClose : points.at(-2).value,
  };
}

async function fetchFred() {
  const response = await fetch("https://fred.stlouisfed.org/graph/fredgraph.csv?id=FEDFUNDS");

  if (!response.ok) {
    throw new Error("기준금리 데이터를 불러오지 못했습니다.");
  }

  const rows = (await response.text()).trim().split("\n").slice(1);
  const points = rows
    .map((row) => {
      const [date, value] = row.split(",");
      return { date: new Date(date).getTime(), value: Number(value) };
    })
    .filter((point) => Number.isFinite(point.date) && Number.isFinite(point.value))
    .slice(-120);

  if (points.length < 2) {
    throw new Error("기준금리 차트 데이터가 부족합니다.");
  }

  return { points, previous: points.at(-2).value, unit: "%" };
}

function getKstDateString() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(new Date())
    .replaceAll("-", "");
}

function parseNumber(value) {
  return Number(value.replaceAll(",", ""));
}

async function fetchNaverInvestorRows() {
  const response = await fetch(
    `https://finance.naver.com/sise/investorDealTrendDay.naver?bizdate=${getKstDateString()}&sosok=&page=1`,
    { headers: { "User-Agent": "Mozilla/5.0" } },
  );

  if (!response.ok) {
    throw new Error("네이버 수급 데이터를 불러오지 못했습니다.");
  }

  const html = new TextDecoder("euc-kr").decode(await response.arrayBuffer());
  const cells = [...html.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)]
    .map((match) => match[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim())
    .filter(Boolean);
  const rows = [];

  for (let index = 0; index + 10 < cells.length; index += 11) {
    const date = cells[index];
    const foreign = parseNumber(cells[index + 2]);
    const institution = parseNumber(cells[index + 3]);

    if (/^\d{2}\.\d{2}\.\d{2}$/.test(date) && Number.isFinite(foreign) && Number.isFinite(institution)) {
      rows.push({ date, foreign, institution });
    }
  }

  return rows;
}

function naverDateToTime(value) {
  const [year, month, day] = value.split(".");
  return new Date(`20${year}-${month}-${day}T00:00:00+09:00`).getTime();
}

async function fetchNaverFlow(kind) {
  if (!["foreign", "institution"].includes(kind)) {
    throw new Error("지원하지 않는 수급 항목입니다.");
  }

  const rows = await fetchNaverInvestorRows();
  const key = kind === "foreign" ? "foreign" : "institution";
  const points = rows
    .map((row) => ({ date: naverDateToTime(row.date), value: row[key] }))
    .reverse();

  if (points.length < 2) {
    throw new Error("수급 차트 데이터가 부족합니다.");
  }

  return { points, previous: points.at(-2).value, unit: "억원" };
}

function getFearGreedRating(value) {
  if (value <= 24) return "Extreme Fear";
  if (value <= 44) return "Fear";
  if (value <= 55) return "Neutral";
  if (value <= 74) return "Greed";
  return "Extreme Greed";
}

async function fetchFearGreed() {
  try {
    const response = await fetch("https://production.dataviz.cnn.io/index/fearandgreed/graphdata", {
      headers: {
        "User-Agent": "Mozilla/5.0",
        Accept: "application/json",
        Referer: "https://www.cnn.com/markets/fear-and-greed",
      },
    });

    if (response.ok) {
      const data = await response.json();
      const score = Number(data.fear_and_greed?.score);

      if (Number.isFinite(score)) {
        return {
          display: "gauge",
          value: score,
          rating: data.fear_and_greed?.rating || getFearGreedRating(score),
          asOf: "CNN",
        };
      }
    }
  } catch {
    // CNN blocks some server-side requests. Use the public mirror below.
  }

  const response = await fetch("https://www.finhacker.cz/en/fear-and-greed-index-historical-data-and-chart/", {
    headers: { "User-Agent": "Mozilla/5.0" },
  });

  if (!response.ok) {
    throw new Error("Fear & Greed 데이터를 불러오지 못했습니다.");
  }

  const html = await response.text();
  const match = html.match(
    /current value of the Fear & Greed Index as of ([^<]+?) is[\s\S]*?<strong>(\d+)<\/strong>\s*\(([^)]+)\)/i,
  );

  if (!match) {
    throw new Error("Fear & Greed 현재값을 파싱하지 못했습니다.");
  }

  return {
    display: "gauge",
    value: Number(match[2]),
    rating: match[3],
    asOf: match[1],
    source: "FinHacker",
  };
}

module.exports = async function handler(req, res) {
  try {
    const source = req.query.source;
    const symbol = req.query.symbol;

    if (source === "yahoo") {
      send(res, 200, await fetchYahoo(symbol));
      return;
    }

    if (source === "fred" && symbol === "FEDFUNDS") {
      send(res, 200, await fetchFred());
      return;
    }

    if (source === "naver-flow") {
      send(res, 200, await fetchNaverFlow(symbol));
      return;
    }

    if (source === "feargreed") {
      send(res, 200, await fetchFearGreed());
      return;
    }

    send(res, 400, "지원하지 않는 데이터 요청입니다.", "text/plain; charset=utf-8");
  } catch (error) {
    send(res, 502, error.message || "데이터 요청에 실패했습니다.", "text/plain; charset=utf-8");
  }
};
