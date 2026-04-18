require("dotenv").config();
const express = require("express");
const path = require("path");
const { KiteConnect } = require("kiteconnect");

const { unifiedSignal } = require("./strategy_unified");
const { canTrade, qty } = require("./risk_manager");
const { safeOrder } = require("./execution_safe");
const CONFIG = require("./config");

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const kite = new KiteConnect({ api_key: process.env.KITE_API_KEY });

// ===== TIME =====
const getIST = () =>
  new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));

const isMarketOpen = () => {
  const now = getIST();
  const min = now.getHours() * 60 + now.getMinutes();
  return min >= (9 * 60 + 20) && min <= (14 * 60 + 45);
};

// ===== STATE =====
let access_token = process.env.ACCESS_TOKEN || null;
let BOT_ACTIVE = false;

let activeTrades = [], lastPrice = {}, lastScan = [];
let capital = 100000, lossStreak = 0, dailyPnL = 0;

// ===== CAPITAL SYNC (FINAL FIX) =====
async function syncCapital() {
  try {
    const margins = await kite.getMargins();

    console.log("=== MARGINS RAW ===");
    console.log(JSON.stringify(margins, null, 2));

    let value =
      margins?.equity?.net ||
      margins?.equity?.available?.live_balance ||
      margins?.equity?.available?.cash;

    // 🔥 CRITICAL FIX → DO NOT OVERWRITE WITH ZERO
    if (!value || value === 0) {
      console.log("⚠️ Zerodha returned 0 → keeping previous capital:", capital);
      return;
    }

    capital = value;
    console.log("✅ CAPITAL UPDATED:", capital);

  } catch (e) {
    console.error("❌ CAPITAL SYNC FAILED:", e.message);
  }
}

// ===== LOGIN =====
app.get("/login", (req, res) => res.redirect(kite.getLoginURL()));

app.get("/redirect", async (req, res) => {
  try {
    const session = await kite.generateSession(
      req.query.request_token,
      process.env.KITE_API_SECRET
    );

    access_token = session.access_token;
    kite.setAccessToken(access_token);

    // persist token
    process.env.ACCESS_TOKEN = access_token;

    await syncCapital();

    res.send("LOGIN SUCCESS");
  } catch (e) {
    console.error(e);
    res.send("LOGIN FAILED");
  }
});

// ===== MAIN LOOP =====
setInterval(async () => {

  if (!BOT_ACTIVE || !access_token) return;

  try {

    // ALWAYS SYNC CAPITAL
    await syncCapital();

    // ALWAYS FETCH PRICES
    const prices = await kite.getLTP(CONFIG.STOCKS.map(s => `NSE:${s}`));
    lastScan = [];

    for (let s of CONFIG.STOCKS) {
      let p = prices[`NSE:${s}`].last_price;
      let prev = lastPrice[s];

      let signal = unifiedSignal(p, prev);
      lastScan.push({ symbol: s, price: p, signal });

      lastPrice[s] = p;
    }

    // TRADE ONLY DURING MARKET
    if (!isMarketOpen()) return;

    if (!canTrade(dailyPnL, capital, lossStreak)) return;

    for (let s of CONFIG.STOCKS) {
      let p = prices[`NSE:${s}`].last_price;
      let prev = lastPrice[s];

      let signal = unifiedSignal(p, prev);

      if (signal && activeTrades.length < CONFIG.MAX_TRADES) {
        let quantity = qty(capital, p, CONFIG);

        let order = await safeOrder(() =>
          kite.placeOrder("regular", {
            exchange: "NSE",
            tradingsymbol: s,
            transaction_type: signal,
            quantity: quantity,
            product: "MIS",
            order_type: "MARKET"
          })
        );

        if (order) {
          activeTrades.push({ symbol: s, type: signal, entry: p, qty: quantity });
        }
      }
    }

  } catch (e) {
    console.error("LOOP ERROR:", e.message);
  }

}, 3000);

// ===== CONTROL =====
app.get("/start", (req, res) => {
  BOT_ACTIVE = true;
  res.send("BOT STARTED");
});

app.get("/kill", (req, res) => {
  BOT_ACTIVE = false;
  res.send("BOT STOPPED");
});

// ===== STATUS =====
app.get("/status", (req, res) =>
  res.json({
    capital,
    dailyPnL,
    activeTrades,
    scan: lastScan
  })
);

// ===== PERFORMANCE =====
app.get("/performance", (req, res) => {
  res.json({
    capital,
    dailyPnL,
    lossStreak,
    activeTradesCount: activeTrades.length,
    botActive: BOT_ACTIVE
  });
});

// ===== DEBUG =====
app.get("/debug", (req, res) => {
  res.json({
    token: access_token ? "SET" : "NULL",
    capital
  });
});

app.get("/", (req, res) => {
  res.send(`LIVE BOT | Capital: ${capital}`);
});

app.listen(process.env.PORT || 3000, () => {
  console.log("SERVER RUNNING");
});