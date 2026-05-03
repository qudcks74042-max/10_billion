const symbols = {
  nasdaq: {
    symbol: "^NDX",
    priceId: "nasdaq-price",
    changeId: "nasdaq-change",
  },
  vix: {
    symbol: "^VIX",
    priceId: "vix-price",
    changeId: "vix-change",
  },
};

const formatNumber = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

async function fetchQuote(symbol) {
  const encoded = encodeURIComponent(symbol);
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encoded}?range=5d&interval=1d`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`데이터 요청 실패: ${response.status}`);
  }

  const payload = await response.json();
  const result = payload.chart?.result?.[0];
  const quote = result?.indicators?.quote?.[0];
  const closes = quote?.close?.filter((value) => typeof value === "number");

  if (!closes || closes.length === 0) {
    throw new Error("가격 데이터가 없습니다.");
  }

  const price = closes[closes.length - 1];
  const previous = closes.length >= 2 ? closes[closes.length - 2] : price;
  const change = price - previous;
  const changePercent = previous === 0 ? 0 : (change / previous) * 100;

  return { price, change, changePercent };
}

function renderQuote(config, quote) {
  const priceEl = document.getElementById(config.priceId);
  const changeEl = document.getElementById(config.changeId);
  const sign = quote.change > 0 ? "+" : "";

  priceEl.textContent = formatNumber.format(quote.price);
  changeEl.textContent = `${sign}${formatNumber.format(quote.change)} (${sign}${quote.changePercent.toFixed(2)}%)`;
  changeEl.className = "change";

  if (quote.change > 0) {
    changeEl.classList.add("up");
  } else if (quote.change < 0) {
    changeEl.classList.add("down");
  } else {
    changeEl.classList.add("flat");
  }
}

function renderError(config, message) {
  document.getElementById(config.priceId).textContent = "오류";
  const changeEl = document.getElementById(config.changeId);
  changeEl.textContent = message;
  changeEl.className = "change flat";
}

async function refresh() {
  const updatedAt = document.getElementById("updated-at");
  updatedAt.textContent = "데이터 불러오는 중...";

  await Promise.all(
    Object.values(symbols).map(async (config) => {
      try {
        const quote = await fetchQuote(config.symbol);
        renderQuote(config, quote);
      } catch (error) {
        renderError(config, error.message || "데이터를 불러오지 못했습니다.");
      }
    }),
  );

  updatedAt.textContent = `마지막 업데이트: ${new Date().toLocaleString("ko-KR")}`;
}

document.getElementById("refresh-button").addEventListener("click", refresh);
refresh();
