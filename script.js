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
    eyebrow: "Bitcoin Scalping",
    title: "비트코인 롱 단타 위치",
    target: "btc-view",
    type: "btc",
  },
};

const numberFormat = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });
const krwFormat = new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 0 });
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

function buildBtcView() {
  const view = document.getElementById("btc-view");
  view.innerHTML = `
    <div class="btc-signal-panel">
      <div class="btc-price-card">
        <span class="mini-label">KRW-BTC 현재가</span>
        <strong id="btc-last-price">-</strong>
        <p id="btc-price-change">-</p>
      </div>
      <div class="btc-verdict-card" id="btc-verdict-card">
        <span class="mini-label">롱 신호</span>
        <strong id="btc-verdict">대기</strong>
        <p id="btc-reason">데이터 로딩 중</p>
      </div>
      <div class="btc-score-card">
        <span class="mini-label">종합 점수</span>
        <div class="score-line"><div id="btc-score-bar"></div></div>
        <strong id="btc-score">0 / 100</strong>
      </div>
    </div>
    <div class="btc-trade-grid">
      <article>
        <span class="mini-label">후보 진입</span>
        <strong id="btc-entry">-</strong>
        <p>급등 추격보다 VWAP/EMA 근처 재돌파를 우선합니다.</p>
      </article>
      <article>
        <span class="mini-label">무효화</span>
        <strong id="btc-stop">-</strong>
        <p>종가 이탈 시 롱 시나리오를 다시 계산합니다.</p>
      </article>
      <article>
        <span class="mini-label">부분익절</span>
        <strong id="btc-take">-</strong>
        <p>1분 ATR 기준 1차 청산 후보입니다.</p>
      </article>
      <article>
        <span class="mini-label">리스크</span>
        <strong id="btc-risk">-</strong>
        <p>작은 손절폭이 전제입니다. 과레버리지는 계산하지 않습니다.</p>
      </article>
    </div>
    <div class="btc-detail-grid">
      <section>
        <h2>타임프레임 체크</h2>
        <div id="btc-timeframes" class="btc-timeframes"></div>
      </section>
      <section>
        <h2>실시간 압력</h2>
        <div class="btc-pressure">
          <div><span class="mini-label">틱 모멘텀</span><strong id="btc-tick">-</strong></div>
          <div><span class="mini-label">호가 매수벽</span><strong id="btc-book">-</strong></div>
          <div><span class="mini-label">김치 프리미엄</span><strong id="btc-premium">-</strong></div>
          <div><span class="mini-label">변동성</span><strong id="btc-volatility">-</strong></div>
        </div>
      </section>
    </div>
    <section class="btc-log-panel">
      <h2>최근 판단</h2>
      <ol id="btc-log"></ol>
    </section>
  `;
}

function buildViews() {
  Object.values(markets).forEach((market) => {
    if (market.type === "charts") {
      document.getElementById(market.target).replaceChildren(...market.cards.map(createCard));
    }
  });
  buildBtcView();
}

async function fetchSeries(source, symbol) {
  const response = await fetch(`/api/series?${new URLSearchParams({ source, symbol })}`);
  if (!response.ok) {
    throw new Error((await response.text()) || `${symbol} 데이터를 불러오지 못했습니다.`);
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

function plotPoint(point, bounds, width, height, pad) {
  const x = pad + ((point.date - bounds.start) / (bounds.end - bounds.start || 1)) * (width - pad * 2);
  const y =
    height - pad - ((point.value - bounds.min) / (bounds.max - bounds.min || 1)) * (height - pad * 2);
  return { x, y };
}

function buildLinePath(points, bounds, width, height, pad) {
  return points
    .map((point, index) => {
      const { x, y } = plotPoint(point, bounds, width, height, pad);
      return `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");
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
        <g transform="translate(180 180) rotate(${angle})">
          <line x1="0" y1="0" x2="0" y2="-96" stroke="#f8fafc" stroke-width="7" stroke-linecap="round" />
        </g>
        <circle cx="180" cy="180" r="10" fill="#f8fafc" />
      </svg>
      <div class="gauge-value">${value}</div>
      <div class="gauge-rating">${rating}</div>
      <div class="gauge-source">${series.asOf ? `기준: ${series.asOf}` : "CNN/FinHacker"}</div>
    </div>
  `;
}

function renderChart(container, series) {
  if (series.display === "gauge") {
    renderGauge(container, series);
    return;
  }

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
  const pad = 34;
  const bounds = getBounds(points);
  const linePath = buildLinePath(points, bounds, width, height, pad);
  const last = plotPoint(points.at(-1), bounds, width, height, pad);
  const stroke = change >= 0 ? "#22c55e" : "#ef4444";

  container.innerHTML = `
    <div class="quote-meta">
      <div class="quote-price">${numberFormat.format(latest)}${unit}</div>
      <div class="quote-change ${tone}">
        ${sign}${numberFormat.format(change)} (${sign}${percentFormat.format(changePercent)}%)
      </div>
    </div>
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${container.dataset.symbol} chart">
      <defs>
        <linearGradient id="area-${container.dataset.symbol.replace(/[^a-z0-9]/gi, "")}" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stop-color="${stroke}" stop-opacity="0.22" />
          <stop offset="100%" stop-color="${stroke}" stop-opacity="0" />
        </linearGradient>
      </defs>
      ${[0.25, 0.5, 0.75].map((ratio) => `<line x1="${pad}" y1="${height * ratio}" x2="${width - pad}" y2="${height * ratio}" stroke="#1f2937" />`).join("")}
      ${[0.2, 0.4, 0.6, 0.8].map((ratio) => `<line x1="${width * ratio}" y1="${pad}" x2="${width * ratio}" y2="${height - pad}" stroke="#151c27" />`).join("")}
      <path d="${linePath} L ${width - pad} ${height - pad} L ${pad} ${height - pad} Z" fill="url(#area-${container.dataset.symbol.replace(/[^a-z0-9]/gi, "")})" />
      <path d="${linePath}" fill="none" stroke="${stroke}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />
      <line x1="${pad}" y1="${last.y.toFixed(2)}" x2="${width - pad}" y2="${last.y.toFixed(2)}" stroke="${stroke}" stroke-dasharray="3 4" opacity="0.65" />
      <rect x="${width - 90}" y="${Math.max(6, last.y - 13).toFixed(2)}" width="70" height="24" rx="4" fill="${stroke}" />
      <text x="${width - 55}" y="${Math.max(22, last.y + 4).toFixed(2)}" text-anchor="middle" fill="#fff" font-size="13" font-weight="700">${numberFormat.format(latest)}</text>
      <text x="${width - 28}" y="24" text-anchor="end" fill="#9ca3af" font-size="12">${numberFormat.format(bounds.max)}</text>
      <text x="${width - 28}" y="${height - 12}" text-anchor="end" fill="#9ca3af" font-size="12">${numberFormat.format(bounds.min)}</text>
    </svg>
  `;
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

function loadVisibleCharts() {
  document.querySelector(".market-view.active").querySelectorAll(".market-chart").forEach((container) => {
    if (container.dataset.loaded === "true") return;
    container.dataset.loaded = "true";
    fetchSeries(container.dataset.source, container.dataset.symbol)
      .then((series) => renderChart(container, series))
      .catch((error) => renderError(container, error));
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

function addBtcLog(text) {
  const list = document.getElementById("btc-log");
  if (!list) return;
  const item = document.createElement("li");
  item.textContent = `${new Date().toLocaleTimeString("ko-KR")} ${text}`;
  list.prepend(item);
  while (list.children.length > 8) list.lastElementChild.remove();
}

function renderBtcSignal(data) {
  setText("btc-last-price", formatKrw(data.lastPrice));
  setText("btc-price-change", `${formatSignedPercent(data.dailyChangePercent)} 오늘`);
  setText("btc-verdict", data.verdict);
  setText("btc-reason", data.reason);
  setText("btc-score", `${data.score} / 100`);
  setText("btc-entry", `${formatKrw(data.entryLow)} - ${formatKrw(data.entryHigh)}`);
  setText("btc-stop", formatKrw(data.stop));
  setText("btc-take", formatKrw(data.takeProfit));
  setText("btc-risk", `손절폭 약 ${formatSignedPercent(data.riskPercent).replace("+", "")}`);
  setText("btc-tick", `${formatSignedPercent(data.tickMomentumPercent)} / ${data.tickWindowSeconds}초`);
  setText("btc-book", `${formatSignedPercent(data.orderbookBiasPercent)} 매수 우위`);
  setText("btc-premium", Number.isFinite(data.kimchiPremiumPercent) ? formatSignedPercent(data.kimchiPremiumPercent) : "-");
  setText("btc-volatility", `${formatKrw(data.atr1m)} ATR(1분)`);

  const scoreBar = document.getElementById("btc-score-bar");
  if (scoreBar) scoreBar.style.width = `${data.score}%`;

  const verdictCard = document.getElementById("btc-verdict-card");
  if (verdictCard) verdictCard.className = `btc-verdict-card ${data.tone}`;

  const tfWrap = document.getElementById("btc-timeframes");
  if (tfWrap) {
    tfWrap.innerHTML = data.timeframes.map((tf) => `
      <div class="btc-tf-card ${tf.tone}">
        <span class="mini-label">${tf.label}</span>
        <strong>${Math.round(tf.score)}점</strong>
        <p>${tf.notes.slice(0, 3).join(" · ") || "조건 부족"}</p>
      </div>
    `).join("");
  }

  addBtcLog(`${data.verdict} · ${data.score}점 · 진입 ${formatKrw(data.entryLow)}-${formatKrw(data.entryHigh)} · 손절 ${formatKrw(data.stop)}`);
}

async function loadBtcSignal(force = false) {
  const view = document.getElementById("btc-view");
  if (!view.classList.contains("active")) return;
  const now = Date.now();
  if (!force && view.dataset.loadedAt && now - Number(view.dataset.loadedAt) < 4500) return;
  view.dataset.loadedAt = String(now);

  try {
    const data = await fetchSeries("upbit-btc-signal", "KRW-BTC");
    renderBtcSignal(data);
  } catch (error) {
    addBtcLog(`오류: ${error.message}`);
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
  document.getElementById("updated-at").textContent =
    `마지막 로드: ${new Date().toLocaleString("ko-KR")}`;

  if (market.type === "btc") {
    loadBtcSignal(true);
  } else {
    loadVisibleCharts();
  }
}

buildViews();
document.querySelectorAll(".nav-button").forEach((button) => {
  button.addEventListener("click", () => switchMarket(button.dataset.market));
});
switchMarket("us");
setInterval(() => loadBtcSignal(false), 5000);
