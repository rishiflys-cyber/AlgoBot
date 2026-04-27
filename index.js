require("dotenv").config();
const express = require("express");
const fs = require("fs");
const path = require("path");
const { KiteConnect } = require("kiteconnect");

const app = express();
const PORT = process.env.PORT || 3000;

// ===== CONFIG =====
const RISK_PER_TRADE = 0.02;     // 2%
const MAX_POSITIONS = 2;
const SYMBOLS = [
  "RELIANCE","TCS","INFY","HDFCBANK","ICICIBANK",
  "LT","SBIN","AXISBANK","ITC","KOTAKBANK"
]; // start small, expand later

// ===== INIT =====
const kc = new KiteConnect({ api_key: process.env.API_KEY });

let ACCESS_TOKEN = "";
let activeTrades = [];

// ===== LOAD TOKEN =====
function loadToken() {
  try {
    ACCESS_TOKEN = fs.readFileSync(
      path.join(__dirname, "access_token.txt"),
      "utf8"
    );
    kc.setAccessToken(ACCESS_TOKEN);
    console.log("✅ TOKEN LOADED");
  } catch {
    console.log("⚠️ Login required");
  }
}
loadToken();

// ===== LOGIN =====
app.get("/", (req, res) => {
  res.send(`
    <h2>AlgoBot LIVE</h2>
    <a href="https://kite.zerodha.com/connect/login?api_key=${process.env.API_KEY}">
      👉 LOGIN
    </a>
  `);
});

// ===== REDIRECT =====
app.get("/redirect", async (req, res) => {
  try {
    const request_token = req.query.request_token;

    const session = await kc.generateSession(
      request_token,
      process.env.API_SECRET
    );

    const access_token = session.access_token;

    fs.writeFileSync(
      path.join(__dirname, "access_token.txt"),
      access_token
    );

    kc.setAccessToken(access_token);

    console.log("🔥 TOKEN GENERATED");

    res.send("✅ Login success. Go to /performance");
  } catch (e) {
    res.send("❌ Error: " + e.message);
  }
});

// ===== CAPITAL =====
async function getCapital() {
  try {
    const m = await kc.getMargins();
    return m.equity.available.live_balance || 0;
  } catch {
    return 0;
  }
}

// ===== POSITION SIZE =====
function getQty(capital, price) {
  const risk = capital * RISK_PER_TRADE;
  return Math.max(1, Math.floor(risk / price));
}

// ===== SIMPLE SIGNAL =====
function getSignal(price) {
  // placeholder logic (will upgrade later)
  return Math.random() > 0.7; // only few trades
}

// ===== ENGINE LOOP =====
async function runEngine() {
  try {
    const capital = await getCapital();
    if (capital <= 0) return;

    if (activeTrades.length >= MAX_POSITIONS) return;

    const instruments = SYMBOLS.map(s => `NSE:${s}`);

    const quotes = await kc.getQuote(instruments);

    for (let sym of instruments) {
      if (activeTrades.length >= MAX_POSITIONS) break;

      const data = quotes[sym];
      const price = data.last_price;

      if (!price) continue;

      const already = activeTrades.find(t => t.symbol === sym);
      if (already) continue;

      if (getSignal(price)) {
        const qty = getQty(capital, price);

        try {
          const order = await kc.placeOrder("regular", {
            exchange: "NSE",
            tradingsymbol: sym.replace("NSE:", ""),
            transaction_type: "BUY",
            quantity: qty,
            order_type: "MARKET",
            product: "MIS"
          });

          activeTrades.push({ symbol: sym, qty, price });

          console.log("🚀 TRADE:", sym, qty);
        } catch (e) {
          console.log("Order error:", e.message);
        }
      }
    }
  } catch (e) {
    console.log("Engine error:", e.message);
  }
}

// ===== RUN LOOP =====
setInterval(runEngine, 15000);

// ===== PERFORMANCE =====
app.get("/performance", async (req, res) => {
  const capital = await getCapital();

  res.json({
    capital,
    activeTrades,
    mode: "LIVE"
  });
});

// ===== START =====
app.listen(PORT, () => {
  console.log("🚀 LIVE ENGINE RUNNING");
});