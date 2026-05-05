const markets = {
  us: {
    eyebrow: "US Market",
    title: "미국 주요 지표",
    target: "us-view",
    type: "charts",
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
    title: "한국 주요 지표",
    target: "kr-view",
    type: "charts",
    cards: [
      ["KOSPI Composite", "코스피", "KOSPI", "yahoo", "^KS11"],
      ["KOSDAQ Composite", "코스닥", "KOSDAQ", "yahoo", "^KQ11"],
      ["KOSPI Foreign Net Buying", "외국인 순매수", "외국인", "naver-flow", "foreign"],
      ["KOSPI Institution Net Buying", "기관 순매수", "기관", "naver-flow", "institution"],
    ],
  },
  btc: {
    eyebrow: "Crypto Scalping",
    title: "비트코인 · 이더리움 롱 단타 위치",
    target: "btc-view",
    type: "crypto",
  },
};

const chartPeriods = [
  ["tick", "틱"],
  ["second", "초"],
  ["minute", "분"],
  ["hour", "시간"],
  ["day", "일"],
  ["week", "주"],
  ["month", "월"],
  ["year", "년"],
];
const coinSymbols = ["KRW-BTC", "KRW-ETH"];
const coinNames = { "KRW-BTC": "비트코인", "KRW-ETH": "이더리움" };
const usSignalSymbols = ["NVDA", "MSFT", "AAPL", "AMZN", "META", "GOOGL", "TSLA", "AVGO", "AMD", "QQQ", "SPY"];
const numberFormat = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });
const krwFormat = new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 0 });
const percentFormat = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2, minimumFractionDigits: 2 });

function createRangeButtons(active = "minute") {
  return chartPeriods
    .map(([value, label]) => `<button class="range-button${value === active ? " active" : ""}" type="button" data-period="${value}">${label}</button>`)
    .join("");
}

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
    <div class="range-row">${createRangeButtons(source === "yahoo" ? "day" : "month")}</div>
    <div class="market-chart" data-source="${source}" data-symbol="${symbol}" data-period="${source === "yahoo" ? "day" : "month"}">
      <p>데이터 로딩 중</p>
    </div>
  `;
  return card;
}

function coinId(symbol) {
  return symbol.replace("KRW-", "").toLowerCase();
}

function buildCryptoView() {
  const view = document.getElementById("btc-view");
  view.innerHTML = `
    <div id="coin-grid" class="coin-grid">
      ${coinSymbols.map((symbol) => {
        const id = coinId(symbol);
        return `
          <article class="coin-panel" id="${id}-panel" data-symbol="${symbol}" data-period="minute">
            <div class="coin-head">
              <div>
                <span class="mini-label">${symbol}</span>
                <h2>${coinNames[symbol]}</h2>
              </div>
              <div class="coin-verdict" id="${id}-verdict-card">
                <strong id="${id}-verdict">대기</strong>
                <span id="${id}-score">0점</span>
              </div>
            </div>
            <div class="range-row">${createRangeButtons("minute")}</div>
            <div class="coin-main">
              <div>
                <span class="mini-label">현재가</span>
                <strong class="coin-price" id="${id}-last-price">-</strong>
                <p id="${id}-price-change">-</p>
              </div>
              <div class="coin-chart" id="${id}-chart"><p>차트 로딩 중</p></div>
            </div>
            <div class="coin-trade-grid">
              <div><span class="mini-label">후보 진입</span><strong id="${id}-entry">-</strong></div>
              <div><span class="mini-label">무효화</span><strong id="${id}-stop">-</strong></div>
              <div><span class="mini-label">부분익절</span><strong id="${id}-take">-</strong></div>
              <div><span class="mini-label">리스크</span><strong id="${id}-risk">-</strong></div>
            </div>
            <p class="coin-reason" id="${id}-reason">데이터 로딩 중</p>
            <div class="coin-pressure">
              <div><span class="mini-label">틱 압력</span><strong id="${id}-tick">-</strong></div>
              <div><span class="mini-label">호가</span><strong id="${id}-book">-</strong></div>
              <div><span class="mini-label">김프</span><strong id="${id}-premium">-</strong></div>
              <div><span class="mini-label">ATR</span><strong id="${id}-atr">-</strong></div>
            </div>
            <section class="coin-judgement">
              <h3>판단</h3>
              <div class="coin-timeframes" id="${id}-timeframes"></div>
              <ol id="${id}-log" class="coin-log"></ol>
            </section>
          </article>
        `;
      }).join("")}
    </div>
  `;
}

function buildUsStockPanel() {
  const view = document.getElementById("us-view");
  const panel = document.createElement("section");
  panel.className = "stock-signal-panel";
  panel.innerHTML = `
    <div class="stock-signal-head">
      <div>
        <span class="mini-label">US Stock Scanner</span>
        <h2>미장 롱 후보</h2>
      </div>
      <button id="refresh-us-signals" class="range-button" type="button">갱신</button>
    </div>
    <div id="us-stock-signals" class="stock-signal-grid">
      <p>종목 스캔 중</p>
    </div>
  `;
  view.prepend(panel);
}

function buildViews() {
  Object.values(markets).forEach((market) => {
    if (market.type === "charts") {
      document.getElementById(market.target).replaceChildren(...market.cards.map(createCard));
    }
  });
  buildUsStockPanel();
  buildCryptoView();
}

async function fetchSeries(source, symbol, period) {
  const params = new URLSearchParams({ source, symbol });
  if (period) params.set("period", period);
  const response = await fetch(`/api/series?${params}`);
  if (!response.ok) throw new Error((await response.text()) || `${symbol} 데이터를 불러오지 못했습니다.`);
  return response.json();
}

function getBounds(points) {
  const values = points.map((point) => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const padding = (max - min || Math.abs(max) || 1) * 0.08;
  return { min: min - padding, max: max + padding, start: points[0].date, end: points.at(-1).date };
}

function plotPoint(point, bounds, width, height, pad) {
  const x = pad + ((point.date - bounds.start) / (bounds.end - bounds.start || 1)) * (width - pad * 2);
  const y = height - pad - ((point.value - bounds.min) / (bounds.max - bounds.min || 1)) * (height - pad * 2);
  return { x, y };
}

function buildLinePath(points, bounds, width, height, pad) {
  return points.map((point, index) => {
    const { x, y } = plotPoint(point, bounds, width, height, pad);
    return `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
  }).join(" ");
}

function renderGauge(container, series) {
  const value = Math.round(series.value);
  const rating = series.rating || getFearGreedRating(value);
  const angle = -110 + (Math.max(0, Math.min(100, value)) / 100) * 220;
  container.innerHTML = `
    <div class="gauge-wrap">
      <svg viewBox="0 0 360 230" role="img" aria-label="Fear and Greed gauge">
        <path d="M60 180 A120 120 0 0 1 300 180" fill="none" stroke="#1f2937" stroke-width="24" stroke-linecap="round" />
        <path d="M60 180 A120 120 0 0 1 118 76" fill="none" stroke="#ef4444" stroke-width="24" stroke-linecap="round" />
        <path d="M118 76 A120 120 0 0 1 180 60" fill="none" stroke="#f59e0b" stroke-width="24" />
        <path d="M180 60 A120 120 0 0 1 242 76" fill="none" stroke="#eab308" stroke-width="24" />
        <path d="M242 76 A120 120 0 0 1 300 180" fill="none" stroke="#22c55e" stroke-width="24" stroke-linecap="round" />
        <g transform="translate(180 180) rotate(${angle})"><line x1="0" y1="0" x2="0" y2="-96" stroke="#f8fafc" stroke-width="7" stroke-linecap="round" /></g>
        <circle cx="180" cy="180" r="10" fill="#f8fafc" />
      </svg>
      <div class="gauge-value">${value}</div>
      <div class="gauge-rating">${rating}</div>
      <div class="gauge-source">${series.asOf ? `기준: ${series.asOf}` : "CNN/FinHacker"}</div>
    </div>`;
}

function renderChart(container, series) {
  if (series.display === "gauge") {
    renderGauge(container, series);
    return;
  }
  const points = series.points || [];
  if (points.length < 2) {
    container.innerHTML = "<p>차트 데이터가 부족합니다.</p>";
    return;
  }
  const latest = points.at(-1).value;
  const previous = Number.isFinite(series.previous) ? series.previous : points.at(-2).value;
  const change = latest - previous;
  const changePercent = previous === 0 ? 0 : (change / previous) * 100;
  const tone = change > 0 ? "positive" : change < 0 ? "negative" : "neutral";
  const sign = change > 0 ? "+" : "";
  const unit = series.unit ? ` ${series.unit}` : "";
  const width = 760;
  const height = 250;
  const pad = 34;
  const bounds = getBounds(points);
  const linePath = buildLinePath(points, bounds, width, height, pad);
  const last = plotPoint(points.at(-1), bounds, width, height, pad);
  const stroke = change >= 0 ? "#22c55e" : "#ef4444";
  container.innerHTML = `
    <div class="quote-meta">
      <div class="quote-price">${numberFormat.format(latest)}${unit}</div>
      <div class="quote-change ${tone}">${sign}${numberFormat.format(change)} (${sign}${percentFormat.format(changePercent)}%)</div>
      <div class="quote-period">${series.periodLabel || ""}</div>
    </div>
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${container.dataset.symbol} chart">
      ${[0.25, 0.5, 0.75].map((ratio) => `<line x1="${pad}" y1="${height * ratio}" x2="${width - pad}" y2="${height * ratio}" stroke="#1f2937" />`).join("")}
      <path d="${linePath}" fill="none" stroke="${stroke}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />
      <line x1="${pad}" y1="${last.y.toFixed(2)}" x2="${width - pad}" y2="${last.y.toFixed(2)}" stroke="${stroke}" stroke-dasharray="3 4" opacity="0.65" />
    </svg>`;
}

function getFearGreedRating(value) {
  if (value <= 24) return "Extreme Fear";
  if (value <= 44) return "Fear";
  if (value <= 55) return "Neutral";
  if (value <= 74) return "Greed";
  return "Extreme Greed";
}

function renderError(container, error) {
  container.innerHTML = `<p>${error.message}</p>`;
}

function loadMarketChart(container, force = false) {
  if (!force && container.dataset.loaded === "true") return;
  container.dataset.loaded = "true";
  container.innerHTML = "<p>데이터 로딩 중</p>";
  fetchSeries(container.dataset.source, container.dataset.symbol, container.dataset.period)
    .then((series) => renderChart(container, series))
    .catch((error) => renderError(container, error));
}

function loadVisibleCharts() {
  document.querySelector(".market-view.active").querySelectorAll(".market-chart").forEach((container) => {
    loadMarketChart(container);
  });
}

function formatKrw(value) {
  return Number.isFinite(value) ? `${krwFormat.format(value)}원` : "-";
}

function formatSignedPercent(value) {
  if (!Number.isFinite(value)) return "-";
  return `${value >= 0 ? "+" : ""}${percentFormat.format(value)}%`;
}

function setText(id, value) {
  const node = document.getElementById(id);
  if (node) node.textContent = value;
}

function addCoinLog(symbol, text) {
  const list = document.getElementById(`${coinId(symbol)}-log`);
  if (!list) return;
  const item = document.createElement("li");
  item.textContent = `${new Date().toLocaleTimeString("ko-KR")} ${text}`;
  list.prepend(item);
  while (list.children.length > 5) list.lastElementChild.remove();
}

function renderUsStockSignals(data) {
  const wrap = document.getElementById("us-stock-signals");
  if (!wrap) return;
  const items = data.candidates || [];
  if (!items.length) {
    wrap.innerHTML = "<p>조건에 맞는 후보가 없습니다.</p>";
    return;
  }
  wrap.innerHTML = items.map((item) => `
    <article class="stock-signal-card ${item.tone}">
      <div class="stock-card-head">
        <div>
          <span class="mini-label">${item.symbol}</span>
          <h3>${item.name}</h3>
        </div>
        <strong>${item.score}점</strong>
      </div>
      <div class="stock-price-row">
        <strong>$${numberFormat.format(item.lastPrice)}</strong>
        <span>${formatSignedPercent(item.changePercent)} / 5일</span>
      </div>
      <div class="stock-levels">
        <div><span class="mini-label">후보 진입</span><strong>$${numberFormat.format(item.entryLow)} - $${numberFormat.format(item.entryHigh)}</strong></div>
        <div><span class="mini-label">무효화</span><strong>$${numberFormat.format(item.stop)}</strong></div>
        <div><span class="mini-label">부분익절</span><strong>$${numberFormat.format(item.takeProfit)}</strong></div>
      </div>
      <p>${item.reason}</p>
      <small>${item.notes.join(" · ") || "조건 부족"}</small>
    </article>
  `).join("");
}

async function loadUsStockSignals(force = false) {
  const view = document.getElementById("us-view");
  if (!view.classList.contains("active")) return;
  const now = Date.now();
  if (!force && view.dataset.signalLoadedAt && now - Number(view.dataset.signalLoadedAt) < 60_000) return;
  view.dataset.signalLoadedAt = String(now);
  const wrap = document.getElementById("us-stock-signals");
  if (wrap) wrap.innerHTML = "<p>종목 스캔 중</p>";
  try {
    const data = await fetchSeries("us-stock-signals", usSignalSymbols.join(","), "day");
    renderUsStockSignals(data);
  } catch (error) {
    if (wrap) wrap.innerHTML = `<p>${error.message}</p>`;
  }
}

function renderCoinChart(id, data) {
  const container = document.getElementById(`${id}-chart`);
  if (!container || !data.chartPoints?.length) return;
  renderChart(container, {
    points: data.chartPoints,
    previous: data.chartPoints.at(-2)?.value,
    unit: "원",
    periodLabel: data.chartPeriodLabel,
  });
}

function renderCoinSignal(data) {
  const id = coinId(data.market);
  setText(`${id}-last-price`, formatKrw(data.lastPrice));
  setText(`${id}-price-change`, `${formatSignedPercent(data.dailyChangePercent)} 오늘`);
  setText(`${id}-verdict`, data.verdict);
  setText(`${id}-score`, `${data.score}점`);
  setText(`${id}-entry`, `${formatKrw(data.entryLow)} - ${formatKrw(data.entryHigh)}`);
  setText(`${id}-stop`, formatKrw(data.stop));
  setText(`${id}-take`, formatKrw(data.takeProfit));
  setText(`${id}-risk`, `손절폭 ${formatSignedPercent(data.riskPercent).replace("+", "")}`);
  setText(`${id}-reason`, data.reason);
  setText(`${id}-tick`, `${formatSignedPercent(data.tickMomentumPercent)} / ${data.tickWindowSeconds}초`);
  setText(`${id}-book`, formatSignedPercent(data.orderbookBiasPercent));
  setText(`${id}-premium`, Number.isFinite(data.kimchiPremiumPercent) ? formatSignedPercent(data.kimchiPremiumPercent) : "-");
  setText(`${id}-atr`, formatKrw(data.atr1m));

  const verdictCard = document.getElementById(`${id}-verdict-card`);
  if (verdictCard) verdictCard.className = `coin-verdict ${data.tone}`;

  const tfWrap = document.getElementById(`${id}-timeframes`);
  if (tfWrap) {
    tfWrap.innerHTML = data.timeframes.map((tf) => `
      <div class="btc-tf-card ${tf.tone}">
        <span class="mini-label">${tf.label}</span>
        <strong>${Math.round(tf.score)}점</strong>
        <p>${tf.notes.slice(0, 2).join(" · ") || "조건 부족"}</p>
      </div>`).join("");
  }

  renderCoinChart(id, data);
  addCoinLog(data.market, `${data.verdict} · ${data.score}점 · ${data.chartPeriodLabel} 차트 · 진입 ${formatKrw(data.entryLow)}-${formatKrw(data.entryHigh)}`);
}

async function loadCoinSignal(panel, force = false) {
  const symbol = panel.dataset.symbol;
  const period = panel.dataset.period || "minute";
  const now = Date.now();
  if (!force && panel.dataset.loadedAt && now - Number(panel.dataset.loadedAt) < 4500) return;
  panel.dataset.loadedAt = String(now);

  try {
    const data = await fetchSeries("upbit-crypto-signal", symbol, period);
    renderCoinSignal(data);
  } catch (error) {
    addCoinLog(symbol, `오류: ${error.message}`);
  }
}

async function loadCryptoSignals(force = false) {
  const view = document.getElementById("btc-view");
  if (!view.classList.contains("active")) return;
  for (const panel of view.querySelectorAll(".coin-panel")) {
    await loadCoinSignal(panel, force);
  }
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
  document.getElementById("updated-at").textContent = `마지막 로드: ${new Date().toLocaleString("ko-KR")}`;

  if (market.type === "crypto") {
    loadCryptoSignals(true);
  } else {
    loadVisibleCharts();
    if (marketKey === "us") loadUsStockSignals(true);
  }
}

buildViews();
document.querySelectorAll(".nav-button").forEach((button) => {
  button.addEventListener("click", () => switchMarket(button.dataset.market));
});
document.addEventListener("click", (event) => {
  const button = event.target.closest(".range-button");
  if (!button) return;
  const row = button.closest(".range-row");
  row.querySelectorAll(".range-button").forEach((item) => item.classList.toggle("active", item === button));
  const period = button.dataset.period;
  const chart = row.parentElement.querySelector(".market-chart");
  const panel = row.closest(".coin-panel");
  if (chart) {
    chart.dataset.period = period;
    chart.dataset.loaded = "false";
    loadMarketChart(chart, true);
  }
  if (panel) {
    panel.dataset.period = period;
    loadCoinSignal(panel, true);
  }
});
document.addEventListener("click", (event) => {
  if (event.target.id === "refresh-us-signals") loadUsStockSignals(true);
});
switchMarket("us");
setInterval(() => loadCryptoSignals(false), 5000);
