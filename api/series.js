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

  const encoded = encodeURIComponent(symbol);
  const response = await fetch(
    `https://query1.finance.yahoo.com/v8/finance/chart/${encoded}?range=5d&interval=15m`,
    {
      headers: { "User-Agent": "Mozilla/5.0" },
    },
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

  const text = await response.text();
  const rows = text.trim().split("\n").slice(1);
  const points = rows
    .map((row) => {
      const [date, value] = row.split(",");
      return {
        date: new Date(date).getTime(),
        value: Number(value),
      };
    })
    .filter((point) => Number.isFinite(point.date) && Number.isFinite(point.value))
    .slice(-120);

  if (points.length < 2) {
    throw new Error("기준금리 차트 데이터가 부족합니다.");
  }

  return { points, previous: points.at(-2).value, unit: "%" };
}

function getKstDateString() {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  return formatter.format(new Date()).replaceAll("-", "");
}

function parseNumber(value) {
  return Number(value.replaceAll(",", ""));
}

async function fetchNaverInvestorRows(sosok) {
  const bizdate = getKstDateString();
  const response = await fetch(
    `https://finance.naver.com/sise/investorDealTrendDay.naver?bizdate=${bizdate}&sosok=${sosok}&page=1`,
    {
      headers: { "User-Agent": "Mozilla/5.0" },
    },
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

  const rows = await fetchNaverInvestorRows("");
  const key = kind === "foreign" ? "foreign" : "institution";
  const points = rows
    .map((row) => {
      return {
        date: naverDateToTime(row.date),
        value: row[key],
      };
    })
    .reverse();

  if (points.length < 2) {
    throw new Error("수급 차트 데이터가 부족합니다.");
  }

  return { points, previous: points.at(-2).value, unit: "억원" };
}

async function fetchFearGreed() {
  const response = await fetch("https://production.dataviz.cnn.io/index/fearandgreed/graphdata", {
    headers: { "User-Agent": "Mozilla/5.0" },
  });

  if (!response.ok) {
    throw new Error("Fear & Greed 데이터를 불러오지 못했습니다.");
  }

  const data = await response.json();
  const chartData = data.fear_and_greed_historical?.data ?? data.fear_and_greed_historical ?? [];
  const points = chartData
    .map((point) => {
      const rawDate = point.x ?? point.timestamp ?? point.date;
      const rawValue = point.y ?? point.value ?? point.score;
      const date = Number(rawDate) > 10000000000 ? Number(rawDate) : Number(rawDate) * 1000;
      const value = Number(rawValue);
      return Number.isFinite(date) && Number.isFinite(value) ? { date, value } : null;
    })
    .filter(Boolean)
    .slice(-180);

  if (points.length < 2) {
    throw new Error("Fear & Greed 차트 데이터가 부족합니다.");
  }

  return { points, previous: points.at(-2).value };
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
