const yahooSymbols = new Set(["^DJI", "^IXIC", "^GSPC", "^VIX", "GC=F", "SI=F", "HG=F", "CL=F", "^KS11", "^KQ11"]);
const cryptoMarkets = {
  "KRW-BTC": { name: "비트코인", binance: "BTCUSDT" },
  "KRW-ETH": { name: "이더리움", binance: "ETHUSDT" },
};
const cryptoTimeframes = [
  { key: "1m", label: "1분", path: "minutes/1", weight: 14 },
  { key: "3m", label: "3분", path: "minutes/3", weight: 14 },
  { key: "5m", label: "5분", path: "minutes/5", weight: 14 },
  { key: "15m", label: "15분", path: "minutes/15", weight: 12 },
  { key: "60m", label: "1시간", path: "minutes/60", weight: 12 },
];

function send(res, status, payload, contentType = "application/json; charset=utf-8", cacheControl = "s-maxage=60, stale-while-revalidate=300") {
  res.statusCode = status;
  res.setHeader("Content-Type", contentType);
  res.setHeader("Cache-Control", cacheControl);
  res.end(typeof payload === "string" ? payload : JSON.stringify(payload));
}

async function fetchJson(url, headers = {}) {
  const response = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0", ...headers } });
  if (!response.ok) throw new Error(`${url} 요청 실패`);
  return response.json();
}

async function fetchYahoo(symbol) {
  if (!yahooSymbols.has(symbol)) throw new Error("지원하지 않는 Yahoo 종목입니다.");
  const response = await fetch(
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=5d&interval=15m`,
    { headers: { "User-Agent": "Mozilla/5.0" } },
  );
  if (!response.ok) throw new Error(`${symbol} 데이터를 불러오지 못했습니다.`);
  const result = (await response.json()).chart?.result?.[0];
  const closes = result?.indicators?.quote?.[0]?.close ?? [];
  const timestamps = result?.timestamp ?? [];
  const previousClose = result?.meta?.chartPreviousClose;
  const points = closes
    .map((value, index) => ({ date: timestamps[index] * 1000, value: Number(value) }))
    .filter((point) => Number.isFinite(point.date) && Number.isFinite(point.value));
  if (points.length < 2) throw new Error(`${symbol} 차트 데이터가 부족합니다.`);
  return { points, previous: Number.isFinite(previousClose) ? previousClose : points.at(-2).value };
}

async function fetchFred() {
  const response = await fetch("https://fred.stlouisfed.org/graph/fredgraph.csv?id=FEDFUNDS");
  if (!response.ok) throw new Error("기준금리 데이터를 불러오지 못했습니다.");
  const rows = (await response.text()).trim().split("\n").slice(1);
  const points = rows
    .map((row) => {
      const [date, value] = row.split(",");
      return { date: new Date(date).getTime(), value: Number(value) };
    })
    .filter((point) => Number.isFinite(point.date) && Number.isFinite(point.value))
    .slice(-120);
  if (points.length < 2) throw new Error("기준금리 차트 데이터가 부족합니다.");
  return { points, previous: points.at(-2).value, unit: "%" };
}

function getKstDateString() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date()).replaceAll("-", "");
}

function parseNumber(value) {
  return Number(value.replaceAll(",", ""));
}

async function fetchNaverInvestorRows() {
  const response = await fetch(
    `https://finance.naver.com/sise/investorDealTrendDay.naver?bizdate=${getKstDateString()}&sosok=&page=1`,
    { headers: { "User-Agent": "Mozilla/5.0" } },
  );
  if (!response.ok) throw new Error("네이버 수급 데이터를 불러오지 못했습니다.");
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
  if (!["foreign", "institution"].includes(kind)) throw new Error("지원하지 않는 수급 항목입니다.");
  const rows = await fetchNaverInvestorRows();
  const points = rows.map((row) => ({ date: naverDateToTime(row.date), value: row[kind] })).reverse();
  if (points.length < 2) throw new Error("수급 차트 데이터가 부족합니다.");
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
        return { display: "gauge", value: score, rating: data.fear_and_greed?.rating || getFearGreedRating(score), asOf: "CNN" };
      }
    }
  } catch {
    // CNN may block server-side requests. Use the mirror below.
  }
  const response = await fetch("https://www.finhacker.cz/en/fear-and-greed-index-historical-data-and-chart/", {
    headers: { "User-Agent": "Mozilla/5.0" },
  });
  if (!response.ok) throw new Error("Fear & Greed 데이터를 불러오지 못했습니다.");
  const html = await response.text();
  const match = html.match(
    /current value of the Fear & Greed Index as of ([^<]+?) is[\s\S]*?<strong>(\d+)<\/strong>\s*\(([^)]+)\)/i,
  );
  if (!match) throw new Error("Fear & Greed 현재값을 해석하지 못했습니다.");
  return { display: "gauge", value: Number(match[2]), rating: match[3], asOf: match[1], source: "FinHacker" };
}

function mapUpbitCandle(candle) {
  return {
    date: new Date(candle.candle_date_time_kst).getTime(),
    open: candle.opening_price,
    high: candle.high_price,
    low: candle.low_price,
    close: candle.trade_price,
    volume: candle.candle_acc_trade_volume,
  };
}

function sma(values, length) {
  if (values.length < length) return null;
  return values.slice(-length).reduce((sum, value) => sum + value, 0) / length;
}

function ema(values, length) {
  if (values.length < length) return null;
  const k = 2 / (length + 1);
  return values.reduce((prev, price, index) => (index === 0 ? price : price * k + prev * (1 - k)));
}

function rsi(values, length = 14) {
  if (values.length < length + 1) return null;
  let gains = 0;
  let losses = 0;
  for (let index = values.length - length; index < values.length; index += 1) {
    const diff = values[index] - values[index - 1];
    if (diff >= 0) gains += diff;
    else losses -= diff;
  }
  if (losses === 0) return 100;
  return 100 - 100 / (1 + gains / losses);
}

function atr(candles, length = 14) {
  if (candles.length < length + 1) return null;
  const ranges = [];
  for (let index = candles.length - length; index < candles.length; index += 1) {
    const current = candles[index];
    const previous = candles[index - 1];
    ranges.push(Math.max(current.high - current.low, Math.abs(current.high - previous.close), Math.abs(current.low - previous.close)));
  }
  return ranges.reduce((sum, value) => sum + value, 0) / ranges.length;
}

function vwap(candles, length = 20) {
  const sample = candles.slice(-length);
  const volume = sample.reduce((sum, candle) => sum + candle.volume, 0);
  if (!volume) return null;
  return sample.reduce((sum, candle) => sum + ((candle.high + candle.low + candle.close) / 3) * candle.volume, 0) / volume;
}

function analyzeCryptoFrame(candles) {
  const closes = candles.map((candle) => candle.close);
  const last = closes.at(-1);
  const ema9 = ema(closes.slice(-40), 9);
  const ema21 = ema(closes.slice(-60), 21);
  const mean20 = sma(closes, 20);
  const frameVwap = vwap(candles, 20);
  const frameRsi = rsi(closes, 14);
  const frameAtr = atr(candles, 14);
  const previous = candles.at(-2);
  const current = candles.at(-1);
  let score = 0;
  const notes = [];

  if (ema9 && ema21 && ema9 > ema21) {
    score += 28;
    notes.push("EMA9 > EMA21");
  }
  if (frameVwap && last > frameVwap) {
    score += 20;
    notes.push("VWAP 상단");
  }
  if (mean20 && last > mean20) {
    score += 16;
    notes.push("20평균 상단");
  }
  if (frameRsi && frameRsi >= 42 && frameRsi <= 68) {
    score += 18;
    notes.push(`RSI ${frameRsi.toFixed(0)}`);
  }
  if (previous && current && current.close > current.open && current.close > previous.high) {
    score += 18;
    notes.push("직전 고가 돌파");
  }

  return {
    score: Math.min(score, 100),
    tone: score >= 70 ? "good" : score >= 45 ? "neutral" : "bad",
    last,
    ema9,
    ema21,
    vwap: frameVwap,
    atr: frameAtr,
    notes,
  };
}

function calculateOrderbookBias(orderbook) {
  const units = orderbook.orderbook_units.slice(0, 8);
  const bid = units.reduce((sum, unit) => sum + unit.bid_size, 0);
  const ask = units.reduce((sum, unit) => sum + unit.ask_size, 0);
  return ask ? ((bid - ask) / (bid + ask)) * 100 : 0;
}

function calculateTickMomentum(ticks) {
  if (ticks.length < 2) return { percent: 0, seconds: 0 };
  const sorted = ticks.slice().sort((a, b) => a.timestamp - b.timestamp);
  const first = sorted[0];
  const last = sorted.at(-1);
  return {
    percent: ((last.trade_price - first.trade_price) / first.trade_price) * 100,
    seconds: Math.max(1, Math.round((last.timestamp - first.timestamp) / 1000)),
  };
}

async function fetchCryptoSignal(market) {
  const meta = cryptoMarkets[market];
  if (!meta) throw new Error("지원하지 않는 코인입니다.");
  const upbitBase = "https://api.upbit.com/v1";
  const [tickerRows, orderbookRows, ticks, usdKrwRows, binanceTicker, frameEntries] = await Promise.all([
    fetchJson(`${upbitBase}/ticker?markets=${market}`),
    fetchJson(`${upbitBase}/orderbook?markets=${market}`),
    fetchJson(`${upbitBase}/trades/ticks?market=${market}&count=80`),
    fetchJson(`${upbitBase}/ticker?markets=KRW-USDT`).catch(() => null),
    fetchJson(`https://api.binance.com/api/v3/ticker/price?symbol=${meta.binance}`).catch(() => null),
    Promise.all(
      cryptoTimeframes.map((frame) =>
        fetchJson(`${upbitBase}/candles/${frame.path}?market=${market}&count=120`).then((rows) => [
          frame.key,
          rows.reverse().map(mapUpbitCandle),
        ]),
      ),
    ),
  ]);

  const ticker = tickerRows[0];
  const frames = Object.fromEntries(frameEntries);
  const analyses = Object.fromEntries(cryptoTimeframes.map((frame) => [frame.key, analyzeCryptoFrame(frames[frame.key])]));
  const weighted = cryptoTimeframes.reduce((sum, frame) => sum + (analyses[frame.key].score * frame.weight) / 100, 0);
  const orderbookBiasPercent = calculateOrderbookBias(orderbookRows[0]);
  const tick = calculateTickMomentum(ticks);
  const usdKrw = usdKrwRows?.[0]?.trade_price;
  const binanceUsd = binanceTicker ? Number(binanceTicker.price) : null;
  const fairKrw = usdKrw && binanceUsd ? usdKrw * binanceUsd : null;
  const kimchiPremiumPercent = fairKrw ? ((ticker.trade_price - fairKrw) / fairKrw) * 100 : null;
  const one = analyses["1m"];
  const five = analyses["5m"];
  const hour = analyses["60m"];
  let score = weighted;

  if (orderbookBiasPercent > 4) score += 8;
  if (orderbookBiasPercent < -8) score -= 10;
  if (tick.percent > 0.03) score += 6;
  if (tick.percent < -0.05) score -= 8;
  if (kimchiPremiumPercent !== null && kimchiPremiumPercent > 3.5) score -= 8;
  if (hour.ema9 && hour.ema21 && hour.ema9 < hour.ema21) score -= 12;
  score = Math.max(0, Math.min(100, Math.round(score)));

  const lastPrice = ticker.trade_price;
  const baseAtr = one.atr || five.atr || lastPrice * 0.0015;
  const pullback = Math.max(one.vwap || lastPrice, one.ema9 || lastPrice);
  const entryLow = Math.min(lastPrice, pullback + baseAtr * 0.15);
  const entryHigh = Math.max(lastPrice, pullback + baseAtr * 0.45);
  const stop = Math.min(one.ema21 || lastPrice - baseAtr, (one.vwap || lastPrice) - baseAtr * 0.8);
  const takeProfit = entryHigh + baseAtr * 1.15;
  let verdict = "대기";
  let reason = "상위 추세나 단기 압력이 부족합니다.";
  let tone = "wait";

  if (score >= 72 && lastPrice >= entryLow && lastPrice <= entryHigh * 1.003) {
    verdict = "롱 후보";
    reason = "추세, VWAP, 단기 압력이 함께 맞습니다.";
    tone = "long";
  } else if (score < 45) {
    verdict = "진입 금지";
    reason = "되돌림 매수보다 관망이 유리한 구조입니다.";
    tone = "avoid";
  }

  return {
    market,
    name: meta.name,
    lastPrice,
    dailyChangePercent: ticker.signed_change_rate * 100,
    verdict,
    reason,
    tone,
    score,
    entryLow,
    entryHigh,
    stop,
    takeProfit,
    riskPercent: ((entryHigh - stop) / entryHigh) * 100,
    atr1m: baseAtr,
    tickMomentumPercent: tick.percent,
    tickWindowSeconds: tick.seconds,
    orderbookBiasPercent,
    kimchiPremiumPercent,
    chartPoints: frames["1m"].slice(-80).map((candle) => ({ date: candle.date, value: candle.close })),
    timeframes: cryptoTimeframes.map((frame) => ({
      key: frame.key,
      label: frame.label,
      score: analyses[frame.key].score,
      tone: analyses[frame.key].tone,
      notes: analyses[frame.key].notes,
    })),
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
    if (source === "upbit-crypto-signal") {
      send(res, 200, await fetchCryptoSignal(symbol), "application/json; charset=utf-8", "no-store");
      return;
    }

    send(res, 400, "지원하지 않는 데이터 요청입니다.", "text/plain; charset=utf-8");
  } catch (error) {
    send(res, 502, error.message || "데이터 요청에 실패했습니다.", "text/plain; charset=utf-8");
  }
};
