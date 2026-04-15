require("dotenv").config();
const express = require("express");
const path = require("path");
const { KiteConnect } = require("kiteconnect");

const app = express();
app.use(express.json());

// ===== UI =====
app.use(express.static(path.join(__dirname, "public")));
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public/index.html"));
});

// ===== ZERODHA =====
const kite = new KiteConnect({ api_key: process.env.KITE_API_KEY });

let access_token = null;
let capital = 0;
let BOT_ACTIVE = true;

// ===== LOGIN =====
app.get("/login", (req, res) => res.redirect(kite.getLoginURL()));

app.get("/redirect", async (req, res) => {
  try {
    const session = await kite.generateSession(req.query.request_token, process.env.KITE_API_SECRET);
    access_token = session.access_token;
    kite.setAccessToken(access_token);
    await updateCapital();
    res.send("Login Success ✅ Bot Ready");
  } catch (e) {
    res.send("Login Failed ❌");
  }
});

// ===== CAPITAL =====
async function updateCapital() {
  try {
    const m = await kite.getMargins();
    capital = m.equity.available.live_balance;
  } catch (e) {}
}

// ===== START / STOP =====
app.get("/start", (req, res) => {
  BOT_ACTIVE = true;
  res.send("🚀 BOT STARTED");
});

app.get("/kill", (req, res) => {
  BOT_ACTIVE = false;
  res.send("🛑 BOT STOPPED");
});

// ===== STATUS =====
app.get("/status", async (req, res) => {
  res.json({
    capital,
    bot: BOT_ACTIVE ? "RUNNING" : "STOPPED"
  });
});

// ===== STRATEGY =====
async function run() {
  if (!access_token || !BOT_ACTIVE) return;

  try {
    const instrument = 738561;
    const to = new Date();
    const from = new Date();
    from.setMinutes(from.getMinutes() - 100);

    const candles = await kite.getHistoricalData(instrument, from, to, "5minute");
    if (candles.length < 20) return;

    const price = candles.at(-1).close;
    let qty = Math.floor((capital * 0.02) / price);
    if (qty <= 0) return;

    await kite.placeOrder("regular", {
      exchange: "NSE",
      tradingsymbol: "RELIANCE",
      transaction_type: "BUY",
      quantity: qty,
      order_type: "MARKET",
      product: "MIS"
    });

  } catch (e) {}
}

setInterval(run, 60000);
setInterval(updateCapital, 300000);

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log("🚀 BOT WITH START/KILL RUNNING"));
