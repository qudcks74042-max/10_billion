const numberFormat = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 2,
});

const percentFormat = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 2,
  minimumFractionDigits: 2,
});

async function fetchYahooSeries(symbol) {
  const encoded = encodeURIComponent(symbol);
  const response = await fetch(
    `https://query1.finance.yahoo.com/v8/finance/chart/${encoded}?range=5d&interval=15m`,
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

async function fetchFredSeries() {
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

  return { points, previous: points.at(-2).value };
}

function getBounds(points) {
  const values = points.map((point) => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const padding = (max - min || Math.abs(max) || 1) * 0.08;

  return {
    min: min - padding,
    max: max + padding,
    start: points[0].date,
    end: points.at(-1).date,
  };
}

function buildLinePath(points, bounds, width, height, pad) {
  const usableWidth = width - pad * 2;
  const usableHeight = height - pad * 2;

  return points
    .map((point, index) => {
      const x = pad + ((point.date - bounds.start) / (bounds.end - bounds.start || 1)) * usableWidth;
      const y =
        height - pad - ((point.value - bounds.min) / (bounds.max - bounds.min || 1)) * usableHeight;
      return `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");
}

function renderMarketChart(container, series) {
  const points = series.points;
  const latest = points.at(-1).value;
  const change = latest - series.previous;
  const changePercent = series.previous === 0 ? 0 : (change / series.previous) * 100;
  const tone = change > 0 ? "positive" : change < 0 ? "negative" : "neutral";
  const sign = change > 0 ? "+" : "";
  const width = 760;
  const height = 250;
  const pad = 30;
  const bounds = getBounds(points);
  const linePath = buildLinePath(points, bounds, width, height, pad);
  const fillPath = `${linePath} L ${width - pad} ${height - pad} L ${pad} ${height - pad} Z`;

  container.innerHTML = `
    <div class="quote-meta">
      <div class="quote-price">${numberFormat.format(latest)}</div>
      <div class="quote-change ${tone}">
        ${sign}${numberFormat.format(change)} (${sign}${percentFormat.format(changePercent)}%)
      </div>
    </div>
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${container.dataset.symbol} chart">
      <defs>
        <linearGradient id="line-${container.dataset.symbol.replace(/[^a-z0-9]/gi, "")}" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0%" stop-color="#38bdf8" />
          <stop offset="100%" stop-color="#22c55e" />
        </linearGradient>
        <linearGradient id="fill-${container.dataset.symbol.replace(/[^a-z0-9]/gi, "")}" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stop-color="#38bdf8" stop-opacity="0.22" />
          <stop offset="100%" stop-color="#38bdf8" stop-opacity="0" />
        </linearGradient>
      </defs>
      <line x1="${pad}" y1="${height - pad}" x2="${width - pad}" y2="${height - pad}" stroke="#334155" />
      <line x1="${pad}" y1="${pad}" x2="${pad}" y2="${height - pad}" stroke="#334155" />
      <line x1="${pad}" y1="${height * 0.35}" x2="${width - pad}" y2="${height * 0.35}" stroke="#1f2937" />
      <line x1="${pad}" y1="${height * 0.6}" x2="${width - pad}" y2="${height * 0.6}" stroke="#1f2937" />
      <path d="${fillPath}" fill="url(#fill-${container.dataset.symbol.replace(/[^a-z0-9]/gi, "")})" />
      <path d="${linePath}" fill="none" stroke="url(#line-${container.dataset.symbol.replace(/[^a-z0-9]/gi, "")})" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
  `;
}

function renderChartError(container, error) {
  container.innerHTML = `<p>${error.message}</p>`;
}

async function loadMarketChart(container) {
  const kind = container.dataset.kind;
  const symbol = container.dataset.symbol;
  const series = kind === "fred" ? await fetchFredSeries() : await fetchYahooSeries(symbol);

  renderMarketChart(container, series);
}

function normalizeFearGreedPoint(point) {
  const rawDate = point.x ?? point.timestamp ?? point.date;
  const rawValue = point.y ?? point.value ?? point.score;
  const date = Number(rawDate) > 10000000000 ? Number(rawDate) : Number(rawDate) * 1000;
  const value = Number(rawValue);

  if (!Number.isFinite(date) || !Number.isFinite(value)) {
    return null;
  }

  return { date, value };
}

function buildFearGreedSvg(points) {
  const width = 760;
  const height = 250;
  const padding = 28;
  const usableWidth = width - padding * 2;
  const usableHeight = height - padding * 2;
  const values = points.map((point) => point.value);
  const minDate = Math.min(...points.map((point) => point.date));
  const maxDate = Math.max(...points.map((point) => point.date));

  const path = points
    .map((point, index) => {
      const x = padding + ((point.date - minDate) / (maxDate - minDate || 1)) * usableWidth;
      const y = height - padding - (point.value / 100) * usableHeight;
      return `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");

  const latest = values[values.length - 1];
  const rating = getFearGreedRating(latest);

  return `
    <div class="fear-meta">
      <span class="fear-value">${Math.round(latest)}</span>
      <span class="fear-rating">${rating}</span>
    </div>
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Fear and Greed Index chart">
      <defs>
        <linearGradient id="fearFill" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0%" stop-color="#ef4444" />
          <stop offset="50%" stop-color="#eab308" />
          <stop offset="100%" stop-color="#22c55e" />
        </linearGradient>
      </defs>
      <line x1="${padding}" y1="${height - padding}" x2="${width - padding}" y2="${height - padding}" stroke="#334155" />
      <line x1="${padding}" y1="${padding}" x2="${padding}" y2="${height - padding}" stroke="#334155" />
      <line x1="${padding}" y1="${height - padding - usableHeight * 0.25}" x2="${width - padding}" y2="${height - padding - usableHeight * 0.25}" stroke="#1f2937" />
      <line x1="${padding}" y1="${height - padding - usableHeight * 0.5}" x2="${width - padding}" y2="${height - padding - usableHeight * 0.5}" stroke="#1f2937" />
      <line x1="${padding}" y1="${height - padding - usableHeight * 0.75}" x2="${width - padding}" y2="${height - padding - usableHeight * 0.75}" stroke="#1f2937" />
      <path d="${path}" fill="none" stroke="url(#fearFill)" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
  `;
}

function getFearGreedRating(value) {
  if (value <= 24) return "Extreme Fear";
  if (value <= 49) return "Fear";
  if (value <= 50) return "Neutral";
  if (value <= 74) return "Greed";
  return "Extreme Greed";
}

async function loadFearGreedChart() {
  const container = document.getElementById("fear-greed-chart");
  const score = document.getElementById("fear-greed-score");
  const response = await fetch("https://production.dataviz.cnn.io/index/fearandgreed/graphdata");

  if (!response.ok) {
    throw new Error("Fear & Greed 데이터를 불러오지 못했습니다.");
  }

  const data = await response.json();
  const chartData = data.fear_and_greed_historical?.data ?? data.fear_and_greed_historical ?? [];
  const points = chartData.map(normalizeFearGreedPoint).filter(Boolean).slice(-180);
  const currentScore = Number(data.fear_and_greed?.score ?? points.at(-1)?.value);

  if (points.length < 2 || !Number.isFinite(currentScore)) {
    throw new Error("Fear & Greed 차트 데이터 형식이 변경되었습니다.");
  }

  container.innerHTML = buildFearGreedSvg(points);
  score.textContent = String(Math.round(currentScore));
}

function renderFearGreedFallback(error) {
  const container = document.getElementById("fear-greed-chart");
  container.innerHTML = `
    <p>${error.message}</p>
    <p>
      <a class="fallback-link" href="https://www.cnn.com/markets/fear-and-greed" target="_blank" rel="noreferrer">
        CNN Fear & Greed 원문 보기
      </a>
    </p>
  `;
}

document.querySelectorAll(".market-chart").forEach((container) => {
  loadMarketChart(container).catch((error) => renderChartError(container, error));
});

loadFearGreedChart().catch(renderFearGreedFallback);

document.getElementById("updated-at").textContent =
  `마지막 로드: ${new Date().toLocaleString("ko-KR")}`;
