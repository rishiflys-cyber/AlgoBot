require("dotenv").config();
const express = require("express");
const path = require("path");
const { KiteConnect } = require("kiteconnect");

const app = express();
app.use(express.json());

const kite = new KiteConnect({ api_key: process.env.KITE_API_KEY });

let access_token = null;
let capital = 0;
let trades = [];
let BOT_ACTIVE = true;

// ===== CONFIG =====
const SAFE_MODE = false;
const RISK_PER_TRADE = 0.02;
const MAX_TRADES = 2;

// ===== STATIC UI =====
app.use(express.static(path.join(__dirname, "public")));
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public/index.html"));
});

// ===== LOGIN =====
app.get("/login", (req, res) => res.redirect(kite.getLoginURL()));

app.get("/redirect", async (req, res) => {
  try {
    const session = await kite.generateSession(req.query.request_token, process.env.KITE_API_SECRET);
    access_token = session.access_token;
    kite.setAccessToken(access_token);

    await updateCapital();

    res.send("Login Success ✅ LIVE UI CONNECTED");
  } catch (e) {
    res.send("Login Failed ❌");
  }
});

// ===== CAPITAL =====
async function updateCapital() {
  try {
    const m = await kite.getMargins();
    capital = m.equity.available.live_balance;
  } catch (e) {
    console.log("Capital error:", e.message);
  }
}

// ===== STATUS =====
app.get("/status", async (req, res) => {
  try {
    const positions = await kite.getPositions();
    let pnl = positions.net.reduce((sum, p) => sum + p.pnl, 0);

    res.json({
      pnl,
      trades: trades.length,
      position: positions.net.length ? "ACTIVE" : "NONE",
      entry: null,
      lastLog: "Live trading..."
    });

  } catch (e) {
    res.json({ pnl: 0, trades: 0, position: "ERROR" });
  }
});

// ===== ANALYTICS =====
app.get("/analytics", (req, res) => {
  let wins = trades.filter(t => t.pnl > 0).length;
  let losses = trades.filter(t => t.pnl <= 0).length;

  res.json({
    winRate: trades.length ? ((wins / trades.length) * 100).toFixed(2) : 0,
    wins,
    losses,
    avgWin: 0,
    avgLoss: 0,
    maxDrawdown: 0,
    consecutiveWins: wins,
    recentTrades: trades.slice(-5)
  });
});

// ===== ACCOUNT =====
app.get("/account", (req, res) => {
  res.json({
    available: capital,
    used: 0,
    net: capital
  });
});

// ===== CONTROL =====
app.post("/start", (req, res) => {
  BOT_ACTIVE = true;
  res.send("Started");
});

app.post("/stop", (req, res) => {
  BOT_ACTIVE = false;
  res.send("Stopped");
});

// ===== SIMPLE STRATEGY =====
async function run() {
  if (!access_token || !BOT_ACTIVE) return;

  try {
    const instrument = 738561; // RELIANCE

    const to = new Date();
    const from = new Date();
    from.setMinutes(from.getMinutes() - 100);

    const candles = await kite.getHistoricalData(instrument, from, to, "5minute");

    if (candles.length < 20) return;

    const prices = candles.map(c => c.close);
    const last = prices[prices.length - 1];

    let qty = Math.floor((capital * RISK_PER_TRADE) / last);
    if (qty <= 0) return;

    await kite.placeOrder("regular", {
      exchange: "NSE",
      tradingsymbol: "RELIANCE",
      transaction_type: "BUY",
      quantity: qty,
      order_type: "MARKET",
      product: "MIS"
    });

    trades.push({ symbol: "RELIANCE", pnl: 0 });

  } catch (e) {
    console.log("Trade error:", e.message);
  }
}

setInterval(run, 60000);
setInterval(updateCapital, 300000);

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log("🚀 REAL UI BOT RUNNING"));
