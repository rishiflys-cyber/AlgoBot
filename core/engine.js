require("dotenv").config();
const express = require("express");
const path = require("path");
const { KiteConnect } = require("kiteconnect");

const app = express();
app.use(express.json());

// ✅ FIXED UI PATH
app.use(express.static(path.join(__dirname, "../public")));

const kite = new KiteConnect({ api_key: process.env.KITE_API_KEY });

let access_token = null;
let BOT_ACTIVE = false;
let lastScan = [];

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
  } catch (e) {
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

// ===== BASIC SCAN LOOP (WORKING) =====
const STOCKS = ["RELIANCE","HDFCBANK","ICICIBANK","INFY","TCS"];

setInterval(async () => {
  if (!BOT_ACTIVE || !access_token) return;

  try {
    const prices = await kite.getLTP(STOCKS.map(s => `NSE:${s}`));
    lastScan = STOCKS.map(s => ({
      symbol: s,
      price: prices[`NSE:${s}`].last_price
    }));
  } catch (e) {}
}, 3000);

// ===== ROOT =====
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "../public/index.html"));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("ENGINE RUNNING"));