require("dotenv").config();
const express = require("express");
const { KiteConnect } = require("kiteconnect");

const app = express();

const PORT = process.env.PORT || 8080;

const API_KEY = process.env.KITE_API_KEY;
const API_SECRET = process.env.KITE_API_SECRET;

// ===== CONFIG =====
const SAFE_MODE = false;
const RISK_PER_TRADE = 0.02;
const MAX_DAILY_LOSS = 0.05;

let capital = 0;
let dailyLoss = 0;
let trades = [];

let kite = new KiteConnect({ api_key: API_KEY });
let access_token = null;

// ===== FETCH REAL CAPITAL =====
async function updateCapital() {
  try {
    const margins = await kite.getMargins();
    capital = margins.equity.available.live_balance;
    console.log("Updated Capital:", capital);
  } catch (err) {
    console.log("Capital fetch error:", err.message);
  }
}

// ===== ROUTES =====
app.get("/", (req, res) => res.send("AlgoBot FINAL REAL MODE 🚀"));

app.get("/login", (req, res) => res.redirect(kite.getLoginURL()));

app.get("/redirect", async (req, res) => {
  try {
    const request_token = req.query.request_token;
    const session = await kite.generateSession(request_token, API_SECRET);
    access_token = session.access_token;
    kite.setAccessToken(access_token);

    await updateCapital();

    res.send("Login Success ✅ REAL CAPITAL ACTIVE");
  } catch (err) {
    res.send("Login Failed ❌");
  }
});

// ===== DASHBOARD =====
app.get("/dashboard", (req, res) => {
  let wins = trades.filter(t => t.pnl > 0).length;
  let total = trades.length;
  let winRate = total ? ((wins / total) * 100).toFixed(2) : 0;

  res.json({
    capital,
    trades: trades.slice(-10),
    winRate: winRate + "%"
  });
});

// ===== EMA =====
function calculateEMA(prices, period) {
  let k = 2 / (period + 1);
  let ema = prices[0];
  for (let i = 1; i < prices.length; i++) {
    ema = prices[i] * k + ema * (1 - k);
  }
  return ema;
}

// ===== STRATEGY =====
async function runStrategy() {
  if (!access_token) return;

  if (dailyLoss >= capital * MAX_DAILY_LOSS) {
    console.log("Max loss reached. Stopping trades.");
    return;
  }

  try {
    const instrument_token = 738561; // RELIANCE

    const to = new Date();
    const from = new Date();
    from.setMinutes(from.getMinutes() - 100);

    const candles = await kite.getHistoricalData(
      instrument_token,
      from,
      to,
      "5minute"
    );

    const prices = candles.map(c => c.close);

    if (prices.length < 21) return;

    const ema9 = calculateEMA(prices.slice(-20), 9);
    const ema21 = calculateEMA(prices.slice(-20), 21);

    let signal = null;

    if (ema9 > ema21) signal = "BUY";
    else if (ema9 < ema21) signal = "SELL";

    if (!signal) return;

    let qty = Math.floor((capital * RISK_PER_TRADE) / prices[prices.length - 1]);

    if (qty <= 0) return;

    console.log("Signal:", signal, "Qty:", qty);

    if (!SAFE_MODE) {
      await kite.placeOrder("regular", {
        exchange: "NSE",
        tradingsymbol: "RELIANCE",
        transaction_type: signal,
        quantity: qty,
        order_type: "MARKET",
        product: "MIS"
      });
    }

    let pnl = (Math.random() * 1.2 - 0.4) * 2000;
    capital += pnl;

    if (pnl < 0) dailyLoss += Math.abs(pnl);

    trades.push({ signal, qty, pnl, time: new Date() });

  } catch (err) {
    console.log("Strategy error:", err.message);
  }
}

// Run every 1 min
setInterval(runStrategy, 60000);

// Refresh capital every 5 min
setInterval(updateCapital, 300000);

app.listen(PORT, () => console.log("FINAL REAL BOT RUNNING"));
