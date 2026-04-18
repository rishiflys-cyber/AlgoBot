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

// ===== TIME (IST) =====
const getIST = () =>
  new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));

const minutesNow = () => {
  const n = getIST();
  return n.getHours() * 60 + n.getMinutes();
};

const isMarketOpen = () => {
  const min = minutesNow();
  return min >= (9 * 60 + 20) && min <= (15 * 60 + 20);
};

// ===== STATE =====
let access_token = process.env.ACCESS_TOKEN || null;
let BOT_ACTIVE = false;

let activeTrades = [], lastPrice = {}, lastScan = [];
let capital = 100000, lossStreak = 0, dailyPnL = 0;

// ===== AUTO SCHEDULE (IST) =====
// Start at 09:20, Square-off at 15:20
const AUTO_START_MIN = 9 * 60 + 20;
const AUTO_EXIT_MIN  = 15 * 60 + 20;

// ===== REAL PORTFOLIO VALUE =====
async function syncCapital() {
  try {
    const margins = await kite.getMargins();
    const holdings = await kite.getHoldings();
    const positions = await kite.getPositions();

    let cash =
      margins?.equity?.net ||
      margins?.equity?.available?.live_balance ||
      margins?.equity?.available?.cash || 0;

    let holdingsValue = holdings.reduce((sum, h) => {
      return sum + ((h.last_price || 0) * (h.quantity || 0));
    }, 0);

    let pnl = (positions?.net || []).reduce((sum, p) => sum + (p.pnl || 0), 0);

    let total = cash + holdingsValue + pnl;

    if (total > 0) {
      capital = total;
    }

    console.log("CAPITAL BREAKDOWN:", {
      cash,
      holdingsValue,
      pnl,
      total: capital
    });

  } catch (e) {
    console.error("CAPITAL SYNC FAILED:", e.message);
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
    process.env.ACCESS_TOKEN = access_token;

    await syncCapital();

    res.send("LOGIN SUCCESS");
  } catch (e) {
    console.error(e);
    res.send("LOGIN FAILED");
  }
});

// ===== SQUARE-OFF (uses same safeOrder; no architecture change) =====
async function squareOffAll(pricesMap) {
  try {
    if (!activeTrades.length) return;

    console.log("SQUARE-OFF INITIATED");

    for (let t of activeTrades) {
      const p = pricesMap && pricesMap[`NSE:${t.symbol}`]
        ? pricesMap[`NSE:${t.symbol}`].last_price
        : null;

      await safeOrder(() =>
        kite.placeOrder("regular", {
          exchange: "NSE",
          tradingsymbol: t.symbol,
          transaction_type: t.type === "BUY" ? "SELL" : "BUY",
          quantity: t.qty,
          product: "MIS",
          order_type: "MARKET"
        })
      );

      if (p !== null) {
        const pnl = t.type === "BUY"
          ? (p - t.entry) / t.entry
          : (t.entry - p) / t.entry;

        const tradePnL = capital * pnl;
        dailyPnL += tradePnL;
        if (tradePnL < 0) lossStreak++;
        else lossStreak = 0;
      }
    }

    activeTrades = [];
    BOT_ACTIVE = false; // stop after square-off
    console.log("SQUARE-OFF COMPLETE. BOT STOPPED");

  } catch (e) {
    console.error("SQUARE-OFF ERROR:", e.message);
  }
}

// ===== LOOP =====
setInterval(async () => {

  // Auto start at 09:20 IST
  if (!BOT_ACTIVE && access_token && minutesNow() >= AUTO_START_MIN && minutesNow() < AUTO_EXIT_MIN) {
    BOT_ACTIVE = true;
    console.log("AUTO START TRIGGERED (IST 09:20)");
  }

  if (!access_token) return;

  try {

    await syncCapital();

    const prices = await kite.getLTP(CONFIG.STOCKS.map(s => `NSE:${s}`));
    lastScan = [];

    for (let s of CONFIG.STOCKS) {
      let p = prices[`NSE:${s}`].last_price;
      let prev = lastPrice[s];

      let signal = unifiedSignal(p, prev);
      lastScan.push({ symbol: s, price: p, signal });

      lastPrice[s] = p;
    }

    // Auto square-off at 15:20 IST
    if (minutesNow() >= AUTO_EXIT_MIN) {
      await squareOffAll(prices);
      return;
    }

    if (!BOT_ACTIVE) return;
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

app.listen(process.env.PORT || 3000, () => {
  console.log("SERVER RUNNING");
});
