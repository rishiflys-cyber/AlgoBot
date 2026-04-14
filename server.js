
require("dotenv").config();
const express = require("express");
const fs = require("fs");
const path = require("path");
const { KiteConnect, KiteTicker } = require("kiteconnect");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 8080;

const API_KEY = process.env.KITE_API_KEY;
const API_SECRET = process.env.KITE_API_SECRET;

const TOKEN_FILE = path.join(__dirname, "token.json");
const DB_FILE = path.join(__dirname, "db.json");

const SAFE_MODE = true;
const MAX_DAILY_LOSS = 2000;
const RISK_PER_TRADE = 0.01;

let CAPITAL = 100000;

const STOCKS = [
  { symbol: "RELIANCE", exchange: "NSE", token: 738561 },
  { symbol: "TCS", exchange: "NSE", token: 2953217 },
  { symbol: "INFY", exchange: "NSE", token: 408065 }
];

let kite = new KiteConnect({ api_key: API_KEY });
let ticker;
let access_token = null;
let dailyPnL = 0;
let positions = {};
let tradeLog = [];

function saveDB() {
  fs.writeFileSync(DB_FILE, JSON.stringify({ positions, CAPITAL, tradeLog }));
}

function loadDB() {
  if (fs.existsSync(DB_FILE)) {
    const data = JSON.parse(fs.readFileSync(DB_FILE));
    positions = data.positions || {};
    CAPITAL = data.CAPITAL || CAPITAL;
    tradeLog = data.tradeLog || [];
  }
}

function saveToken(token) {
  fs.writeFileSync(TOKEN_FILE, JSON.stringify({ access_token: token }));
}

function loadToken() {
  if (fs.existsSync(TOKEN_FILE)) {
    return JSON.parse(fs.readFileSync(TOKEN_FILE)).access_token;
  }
  return null;
}

app.get("/", (req, res) => res.send("AlgoBot Running 🚀"));

app.get("/login", (req, res) => res.redirect(kite.getLoginURL()));

app.get("/redirect", async (req, res) => {
  try {
    console.log("FULL QUERY:", req.query);

    const request_token = req.query.request_token;

    if (!request_token) {
      return res.send("No request token received ❌");
    }

    const session = await kite.generateSession(request_token, API_SECRET);

    access_token = session.access_token;
    kite.setAccessToken(access_token);

    saveToken(access_token);
    startTicker();

    res.send("Login Success ✅ Bot Started");
  } catch (err) {
    console.error(err);
    res.send("Login Failed ❌");
  }
});

function init() {
  loadDB();
  const token = loadToken();
  if (token) {
    access_token = token;
    kite.setAccessToken(token);
    startTicker();
  }
}

function EMA(arr, p) {
  let k = 2 / (p + 1);
  return arr.reduce((a, v) => v * k + a * (1 - k));
}

function positionSize(entry, sl) {
  const risk = CAPITAL * RISK_PER_TRADE;
  return Math.floor(risk / Math.abs(entry - sl));
}

async function getHistorical(token) {
  try {
    const to = new Date();
    const from = new Date();
    from.setMinutes(from.getMinutes() - 30);
    const data = await kite.getHistoricalData(token, from, to, "5minute");
    return data.map(c => c.close);
  } catch {
    return [];
  }
}

async function evaluateTick(tick) {
  if (dailyPnL <= -MAX_DAILY_LOSS) return;

  const stock = STOCKS.find(s => s.token === tick.instrument_token);
  if (!stock) return;

  const ltp = tick.last_price;

  const history = await getHistorical(stock.token);
  if (history.length < 5) return;

  const emaFast = EMA(history.slice(-5), 5);
  const emaSlow = EMA(history.slice(-10), 10);
  const breakout = ltp > Math.max(...history.slice(-5));

  if (emaFast > emaSlow && breakout && !positions[stock.symbol]) {
    const sl = ltp * 0.99;
    const qty = positionSize(ltp, sl);
    if (qty <= 0) return;

    positions[stock.symbol] = { entry: ltp, sl, qty };

    tradeLog.push({ type: "BUY", symbol: stock.symbol, price: ltp, time: new Date() });

    if (!SAFE_MODE) {
      await kite.placeOrder("regular", {
        exchange: stock.exchange,
        tradingsymbol: stock.symbol,
        transaction_type: "BUY",
        quantity: qty,
        order_type: "MARKET",
        product: "MIS"
      });
    }

    saveDB();
  }

  managePosition(stock.symbol, ltp);
}

function managePosition(symbol, ltp) {
  const pos = positions[symbol];
  if (!pos) return;

  if (ltp > pos.entry * 1.01) {
    pos.sl = Math.max(pos.sl, ltp * 0.995);
  }

  if (ltp <= pos.sl) {
    tradeLog.push({ type: "SELL", symbol, price: ltp, time: new Date() });

    if (!SAFE_MODE) {
      kite.placeOrder("regular", {
        exchange: "NSE",
        tradingsymbol: symbol,
        transaction_type: "SELL",
        quantity: pos.qty,
        order_type: "MARKET",
        product: "MIS"
      });
    }

    delete positions[symbol];
    saveDB();
  }
}

function startTicker() {
  ticker = new KiteTicker({ api_key: API_KEY, access_token });

  ticker.connect();

  ticker.on("connect", () => {
    const tokens = STOCKS.map(s => s.token);
    ticker.subscribe(tokens);
    ticker.setMode(ticker.modeFull, tokens);
  });

  ticker.on("ticks", ticks => {
    ticks.forEach(t => evaluateTick(t));
  });
}

async function updatePnL() {
  try {
    const pos = await kite.getPositions();
    dailyPnL = pos.net.reduce((a, p) => a + p.pnl, 0);
    CAPITAL += dailyPnL;
    saveDB();
  } catch {}
}

setInterval(updatePnL, 60000);

app.get("/dashboard", (req, res) => {
  res.json({
    capital: CAPITAL,
    pnl: dailyPnL,
    positions,
    trades: tradeLog.slice(-20)
  });
});

app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    capital: CAPITAL,
    pnl: dailyPnL
  });
});

app.listen(PORT, () => {
  console.log("AlgoBot Running on", PORT);
  init();
});
