const markets = {
  us: {
    eyebrow: "US Market",
    title: "미국장 주요 지표",
    target: "us-view",
    cards: [
      ["Dow Jones", "다우존스", "DJI", "yahoo", "^DJI"],
      ["Nasdaq Composite", "나스닥", "IXIC", "yahoo", "^IXIC"],
      ["S&P 500", "S&P 500", "SPX", "yahoo", "^GSPC"],
      ["CBOE Volatility Index", "VIX 지수", "VIX", "yahoo", "^VIX"],
      ["CNN Market Sentiment", "Fear & Greed", "F&G", "feargreed", "feargreed"],
      ["Gold Futures", "금", "GC", "yahoo", "GC=F"],
      ["Silver Futures", "은", "SI", "yahoo", "SI=F"],
      ["Copper Futures", "구리", "HG", "yahoo", "HG=F"],
      ["WTI Crude Oil", "유가", "CL", "yahoo", "CL=F"],
      ["Federal Funds Rate", "미국 기준금리", "FED", "fred", "FEDFUNDS"],
    ],
  },
  kr: {
    eyebrow: "Korea Market",
    title: "한국장 주요 지표",
    target: "kr-view",
    cards: [
      ["KOSPI Composite", "코스피", "KOSPI", "yahoo", "^KS11"],
      ["KOSDAQ Composite", "코스닥", "KOSDAQ", "yahoo", "^KQ11"],
      ["KOSPI Foreign Net Buying", "외인 유입량", "외인", "naver-flow", "foreign"],
      ["KOSPI Institution Net Buying", "기관 유입량", "기관", "naver-flow", "institution"],
    ],
  },
};

const numberFormat = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 2,
});

const percentFormat = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 2,
  minimumFractionDigits: 2,
});

function createCard([subtitle, title, badge, source, symbol]) {
  const card = document.createElement("article");
  card.className = "chart-card";
  card.innerHTML = `
    <div class="card-head">
      <div>
        <p>${subtitle}</p>
        <h2>${title}</h2>
      </div>
      <span>${badge}</span>
    </div>
    <div class="market-chart" data-source="${source}" data-symbol="${symbol}">
      <p>데이터 로딩 중</p>
    </div>
  `;
  return card;
}

function buildViews() {
  Object.values(markets).forEach((market) => {
    const target = document.getElementById(market.target);
    target.replaceChildren(...market.cards.map(createCard));
  });
}

async function fetchSeries(source, symbol) {
  const params = new URLSearchParams({ source, symbol });
  const response = await fetch(`/api/series?${params.toString()}`);

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `${symbol} 데이터를 불러오지 못했습니다.`);
  }

  return response.json();
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

function renderChart(container, series) {
  const points = series.points;
  const latest = points.at(-1).value;
  const previous = Number.isFinite(series.previous) ? series.previous : points.at(-2).value;
  const change = latest - previous;
  const changePercent = previous === 0 ? 0 : (change / previous) * 100;
  const tone = change > 0 ? "positive" : change < 0 ? "negative" : "neutral";
  const sign = change > 0 ? "+" : "";
  const unit = series.unit ? ` ${series.unit}` : "";
  const width = 760;
  const height = 250;
  const pad = 30;
  const bounds = getBounds(points);
  const linePath = buildLinePath(points, bounds, width, height, pad);
  const fillPath = `${linePath} L ${width - pad} ${height - pad} L ${pad} ${height - pad} Z`;
  const id = container.dataset.symbol.replace(/[^a-z0-9]/gi, "");

  container.innerHTML = `
    <div class="quote-meta">
      <div class="quote-price">${numberFormat.format(latest)}${unit}</div>
      <div class="quote-change ${tone}">
        ${sign}${numberFormat.format(change)} (${sign}${percentFormat.format(changePercent)}%)
      </div>
    </div>
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${container.dataset.symbol} chart">
      <defs>
        <linearGradient id="line-${id}" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0%" stop-color="#38bdf8" />
          <stop offset="100%" stop-color="#22c55e" />
        </linearGradient>
        <linearGradient id="fill-${id}" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stop-color="#38bdf8" stop-opacity="0.22" />
          <stop offset="100%" stop-color="#38bdf8" stop-opacity="0" />
        </linearGradient>
      </defs>
      <line x1="${pad}" y1="${height - pad}" x2="${width - pad}" y2="${height - pad}" stroke="#334155" />
      <line x1="${pad}" y1="${pad}" x2="${pad}" y2="${height - pad}" stroke="#334155" />
      <line x1="${pad}" y1="${height * 0.35}" x2="${width - pad}" y2="${height * 0.35}" stroke="#1f2937" />
      <line x1="${pad}" y1="${height * 0.6}" x2="${width - pad}" y2="${height * 0.6}" stroke="#1f2937" />
      <path d="${fillPath}" fill="url(#fill-${id})" />
      <path d="${linePath}" fill="none" stroke="url(#line-${id})" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
  `;
}

function renderError(container, error) {
  container.innerHTML = `<p>${error.message}</p>`;
}

function loadVisibleCharts() {
  const active = document.querySelector(".market-view.active");
  active.querySelectorAll(".market-chart").forEach((container) => {
    if (container.dataset.loaded === "true") return;
    container.dataset.loaded = "true";
    fetchSeries(container.dataset.source, container.dataset.symbol)
      .then((series) => renderChart(container, series))
      .catch((error) => renderError(container, error));
  });
}

function switchMarket(marketKey) {
  const market = markets[marketKey];
  document.querySelectorAll(".nav-button").forEach((button) => {
    button.classList.toggle("active", button.dataset.market === marketKey);
  });
  document.querySelectorAll(".market-view").forEach((view) => {
    view.classList.toggle("active", view.id === market.target);
  });
  document.getElementById("market-eyebrow").textContent = market.eyebrow;
  document.getElementById("market-title").textContent = market.title;
  document.getElementById("updated-at").textContent =
    `마지막 로드: ${new Date().toLocaleString("ko-KR")}`;
  loadVisibleCharts();
}

buildViews();
document.querySelectorAll(".nav-button").forEach((button) => {
  button.addEventListener("click", () => switchMarket(button.dataset.market));
});
switchMarket("us");
