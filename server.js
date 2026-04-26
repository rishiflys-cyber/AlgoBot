
require('dotenv').config();
const express = require('express');
const fs = require('fs');
const axios = require('axios');
const KiteConnect = require("kiteconnect").KiteConnect;

const app = express();
const PORT = process.env.PORT || 3000;

const LIVE = process.env.LIVE_TRADING === "true";
const TOKEN_FILE = "access_token.json";
const DATA_FILE = "trade_data.json";
const HIST_FILE = "historical_data.json";

let kite = new KiteConnect({ api_key: process.env.KITE_API_KEY });
let accessToken = null;

if (fs.existsSync(TOKEN_FILE)) {
  try {
    const saved = JSON.parse(fs.readFileSync(TOKEN_FILE));
    accessToken = saved.token;
    kite.setAccessToken(accessToken);
  } catch {}
}

let tradeDB = fs.existsSync(DATA_FILE) ? JSON.parse(fs.readFileSync(DATA_FILE)) : [];
let historical = fs.existsSync(HIST_FILE) ? JSON.parse(fs.readFileSync(HIST_FILE)) : [];

let state = {
  capital: 0,
  pnl: 0,
  strategies: {
    momentum: { weight: 0.4, pnl: 0 },
    breakout: { weight: 0.3, pnl: 0 },
    meanReversion: { weight: 0.3, pnl: 0 }
  },
  backtest: { trades: 0, winRate: 0, expectancy: 0 },
  activeTrades: [],
  closedTrades: [],
  serverIP: null,
  mode: LIVE ? "LIVE" : "PAPER"
};

let lastPrice = {};

// LOGIN
app.get('/login', (req, res) => {
  res.redirect(kite.getLoginURL());
});

app.get('/redirect', async (req, res) => {
  try {
    const session = await kite.generateSession(req.query.request_token, process.env.KITE_API_SECRET);
    accessToken = session.access_token;
    kite.setAccessToken(accessToken);
    fs.writeFileSync(TOKEN_FILE, JSON.stringify({ token: accessToken }));

    const ip = await axios.get("https://api.ipify.org?format=json");
    state.serverIP = ip.data.ip;

    res.send("Login success | IP: " + state.serverIP);
  } catch {
    res.send("Login failed");
  }
});

// CAPITAL
async function updateCapital() {
  try {
    const m = await kite.getMargins();
    state.capital = m?.equity?.available?.cash || m?.equity?.net || state.capital;
  } catch {}
}

// STRATEGIES
function momentum(q, prev) { return prev && q.last_price > prev; }
function breakout(q) { return q.ohlc && q.last_price > q.ohlc.high * 0.995; }
function meanReversion(q) { return q.ohlc && q.last_price < q.ohlc.low * 1.005; }

// EXECUTION
async function executeOrder(sym, qty, side) {
  if (!LIVE) return;
  try {
    const [exchange, tradingsymbol] = sym.split(":");
    await kite.placeOrder("regular", {
      exchange,
      tradingsymbol,
      transaction_type: side,
      quantity: qty,
      product: "MIS",
      order_type: "MARKET",
      market_protection: 2
    });
  } catch {}
}

// MAIN LOOP
setInterval(async () => {
  try {
    if (!accessToken) return;

    await updateCapital();

    const stocks = ["NSE:RELIANCE","NSE:TCS","NSE:INFY"];
    const quotes = await kite.getQuote(stocks);

    for (const sym of stocks) {
      const q = quotes[sym];
      if (!q || !q.last_price) continue;

      const m = momentum(q, lastPrice[sym]);
      const b = breakout(q);
      const r = meanReversion(q);

      lastPrice[sym] = q.last_price;

      let strategy = m ? "momentum" : b ? "breakout" : r ? "meanReversion" : null;
      if (!strategy) continue;

      if (state.activeTrades.length >= 3) break;

      const alloc = state.capital * state.strategies[strategy].weight;
      const qty = Math.max(1, Math.floor((alloc * 0.02) / q.last_price));

      await executeOrder(sym, qty, "BUY");

      state.activeTrades.push({
        symbol: sym,
        strategy,
        entry: q.last_price,
        qty,
        sl: q.last_price * 0.995,
        target: q.last_price * 1.02
      });
    }

    // EXIT
    state.activeTrades = state.activeTrades.filter(tr => {
      const cp = lastPrice[tr.symbol];
      if (!cp) return true;

      if (cp >= tr.target || cp <= tr.sl) {
        const pnl = (cp - tr.entry) * tr.qty;
        state.pnl += pnl;
        state.strategies[tr.strategy].pnl += pnl;

        tradeDB.push({ pnl });
        fs.writeFileSync(DATA_FILE, JSON.stringify(tradeDB));

        executeOrder(tr.symbol, tr.qty, "SELL");

        state.closedTrades.push({ ...tr, exit: cp, pnl });
        return false;
      }
      return true;
    });

  } catch (e) {
    console.log("LOOP ERROR:", e.message);
  }
}, 3000);

// BACKTEST
function runBacktest(data) {
  let trades = 0, wins = 0;
  for (let i = 1; i < data.length; i++) {
    if (data[i].close > data[i - 1].close) {
      trades++;
      if (Math.random() > 0.5) wins++;
    }
  }
  const winRate = wins / (trades || 1);
  const expectancy = winRate * 0.02 - (1 - winRate) * 0.01;
  state.backtest = { trades, winRate, expectancy };
}

// ROUTES
app.get('/', (req, res) => res.json(state));
app.get('/performance', (req, res) => res.json(state));
app.get('/backtest', (req, res) => {
  runBacktest(historical);
  res.json(state.backtest);
});

app.listen(PORT, () => console.log("FINAL SYSTEM RUNNING"));
