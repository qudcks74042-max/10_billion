const tradingViewOptions = {
  autosize: true,
  interval: "60",
  timezone: "Asia/Seoul",
  theme: "dark",
  style: "1",
  locale: "kr",
  allow_symbol_change: true,
  calendar: false,
  support_host: "https://www.tradingview.com",
};

function createTradingViewChart(container) {
  const symbol = container.dataset.symbol;
  const widget = document.createElement("div");
  const chartTarget = document.createElement("div");
  const script = document.createElement("script");

  widget.className = "tradingview-widget-container";
  chartTarget.className = "tradingview-widget-container__widget";
  script.type = "text/javascript";
  script.async = true;
  script.src = "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";
  script.innerHTML = JSON.stringify({
    ...tradingViewOptions,
    symbol,
  });

  widget.append(chartTarget, script);
  container.appendChild(widget);
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

document.querySelectorAll(".tv-chart").forEach(createTradingViewChart);

loadFearGreedChart().catch(renderFearGreedFallback);

document.getElementById("updated-at").textContent =
  `마지막 로드: ${new Date().toLocaleString("ko-KR")}`;
