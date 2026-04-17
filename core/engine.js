require("dotenv").config();
const express = require("express");
const path = require("path");
const { KiteConnect } = require("kiteconnect");

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "../public")));

const kite = new KiteConnect({ api_key: process.env.KITE_API_KEY });

let access_token = null;
let BOT_ACTIVE = false;
let lastScan = [];

let activeTrade = null;

const STOCKS = ["RELIANCE","HDFCBANK","ICICIBANK","INFY","TCS"];

// ===== LOGIN =====
app.get("/login", (req, res) => {
  res.redirect(kite.getLoginURL());
});

app.get("/redirect", async (req, res) => {
  try {
    const session = await kite.generateSession(
      req.query.request_token,
      process.env.KITE_API_SECRET
    );
    access_token = session.access_token;
    kite.setAccessToken(access_token);
    res.send("OK");
  } catch {
    res.send("Login Failed");
  }
});

// ===== CONTROL =====
app.get("/start", (req, res) => {
  BOT_ACTIVE = true;
  res.send("STARTED");
});

app.get("/kill", (req, res) => {
  BOT_ACTIVE = false;
  res.send("STOPPED");
});

// ===== STATUS =====
app.get("/status", (req, res) => {
  res.json(lastScan);
});

// ===== SIMPLE SIGNAL =====
let lastPrice = {};

function getSignal(price, prev) {
  if (!prev) return null;
  let change = (price - prev) / prev;

  if (change > 0.002) return "BUY";
  if (change < -0.002) return "SELL";
  return null;
}

// ===== MAIN LOOP =====
setInterval(async () => {
  if (!BOT_ACTIVE || !access_token) return;

  try {
    const prices = await kite.getLTP(STOCKS.map(s => `NSE:${s}`));

    lastScan = [];

    let best = null;
    let bestScore = 0;

    for (let s of STOCKS) {
      let price = prices[`NSE:${s}`].last_price;
      let prev = lastPrice[s];

      let signal = getSignal(price, prev);
      let score = prev ? Math.abs((price - prev) / prev) : 0;

      lastScan.push({ symbol: s, price, signal, score });

      if (score > bestScore && signal) {
        bestScore = score;
        best = { symbol: s, price, signal };
      }

      lastPrice[s] = price;
    }

    // ===== EXIT =====
    if (activeTrade) {
      let price = prices[`NSE:${activeTrade.symbol}`].last_price;

      let exit = false;

      if (activeTrade.type === "BUY") {
        if (price <= activeTrade.entry * 0.99) exit = true;
        if (price >= activeTrade.entry * 1.02) exit = true;
      } else {
        if (price >= activeTrade.entry * 1.01) exit = true;
        if (price <= activeTrade.entry * 0.98) exit = true;
      }

      if (exit) {
        await kite.placeOrder("regular", {
          exchange: "NSE",
          tradingsymbol: activeTrade.symbol,
          transaction_type: activeTrade.type === "BUY" ? "SELL" : "BUY",
          quantity: 1,
          product: "MIS",
          order_type: "MARKET"
        });

        activeTrade = null;
      }

      return;
    }

    // ===== ENTRY =====
    if (!best) return;

    await kite.placeOrder("regular", {
      exchange: "NSE",
      tradingsymbol: best.symbol,
      transaction_type: best.signal,
      quantity: 1,
      product: "MIS",
      order_type: "MARKET"
    });

    activeTrade = {
      symbol: best.symbol,
      type: best.signal,
      entry: best.price
    };

  } catch (e) {}
}, 3000);

// ===== ROOT =====
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "../public/index.html"));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("BOT RUNNING"));