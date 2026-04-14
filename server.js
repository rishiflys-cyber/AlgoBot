require("dotenv").config();
const express = require("express");
const { KiteConnect } = require("kiteconnect");

const app = express();
const PORT = process.env.PORT || 8080;

const kite = new KiteConnect({ api_key: process.env.KITE_API_KEY });

let access_token = null;
let capital = 0;
let trades = [];
let openTrades = 0;

// ===== CONFIG =====
const SAFE_MODE = false;
const MAX_TRADES = 2;
const RISK_PER_TRADE = 0.02;

// ===== STOCK LIST =====
const stocks = [
  { symbol: "RELIANCE", token: 738561 },
  { symbol: "TCS", token: 2953217 },
  { symbol: "INFY", token: 408065 }
];

// ===== LOGIN =====
app.get("/login", (req, res) => res.redirect(kite.getLoginURL()));

app.get("/redirect", async (req, res) => {
  try {
    const session = await kite.generateSession(req.query.request_token, process.env.KITE_API_SECRET);
    access_token = session.access_token;
    kite.setAccessToken(access_token);

    await updateCapital();

    res.send("Login Success ✅ LIVE MODE ACTIVE");
  } catch (e) {
    res.send("Login Failed ❌");
  }
});

// ===== CAPITAL =====
async function updateCapital() {
  const m = await kite.getMargins();
  capital = m.equity.available.live_balance;
}

// ===== DASHBOARD =====
app.get("/dashboard", (req, res) => {
  let wins = trades.filter(t => t.pnl > 0).length;
  let total = trades.length;
  let winRate = total ? ((wins / total) * 100).toFixed(2) : 0;

  res.json({ capital, trades: trades.slice(-10), winRate: winRate + "%" });
});

// ===== EMA =====
function ema(prices, p) {
  let k = 2 / (p + 1);
  let e = prices[0];
  for (let i = 1; i < prices.length; i++) e = prices[i]*k + e*(1-k);
  return e;
}

// ===== STRATEGY =====
async function run() {
  if (!access_token) return;
  if (openTrades >= MAX_TRADES) return;

  for (let s of stocks) {
    try {
      const to = new Date();
      const from = new Date();
      from.setMinutes(from.getMinutes() - 200);

      const candles = await kite.getHistoricalData(s.token, from, to, "5minute");
      if (candles.length < 30) continue;

      const prices = candles.map(c => c.close);
      const high = Math.max(...prices.slice(-10));
      const low = Math.min(...prices.slice(-10));

      const ema9 = ema(prices.slice(-20), 9);
      const ema21 = ema(prices.slice(-20), 21);

      let signal = null;

      if (ema9 > ema21 && prices.at(-1) > high) signal = "BUY";
      if (ema9 < ema21 && prices.at(-1) < low) signal = "SELL";

      if (!signal) continue;

      let qty = Math.floor((capital * RISK_PER_TRADE) / prices.at(-1));
      if (qty <= 0) continue;

      console.log("TRADE:", s.symbol, signal, qty);

      if (!SAFE_MODE) {
        await kite.placeOrder("regular", {
          exchange: "NSE",
          tradingsymbol: s.symbol,
          transaction_type: signal,
          quantity: qty,
          order_type: "MARKET",
          product: "MIS"
        });
      }

      openTrades++;
      trades.push({ symbol: s.symbol, signal, qty, pnl: 0, time: new Date() });

    } catch (e) {
      console.log("Err:", e.message);
    }
  }
}

setInterval(run, 60000);
setInterval(updateCapital, 300000);

app.listen(PORT, () => console.log("LIVE BOT RUNNING CLEAN"));