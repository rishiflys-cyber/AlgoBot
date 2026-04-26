
require('dotenv').config();
const express = require('express');
const KiteConnect = require("kiteconnect").KiteConnect;

const app = express();
const PORT = process.env.PORT || 3000;

const LIVE = process.env.LIVE_TRADING === "true";

let kite = new KiteConnect({ api_key: process.env.KITE_API_KEY });
let accessToken = process.env.ACCESS_TOKEN;

if (accessToken) kite.setAccessToken(accessToken);

// ===== STOCK UNIVERSE (sample 50, extendable) =====
const STOCKS = [
"NSE:RELIANCE","NSE:TCS","NSE:INFY","NSE:HDFCBANK","NSE:ICICIBANK",
"NSE:SBIN","NSE:LT","NSE:AXISBANK","NSE:ITC","NSE:MARUTI",
"NSE:BAJFINANCE","NSE:KOTAKBANK","NSE:HINDUNILVR","NSE:ASIANPAINT",
"NSE:WIPRO","NSE:ULTRACEMCO","NSE:TITAN","NSE:NTPC","NSE:POWERGRID",
"NSE:ONGC","NSE:COALINDIA","NSE:TECHM","NSE:JSWSTEEL","NSE:TATASTEEL",
"NSE:INDUSINDBK","NSE:GRASIM","NSE:ADANIENT","NSE:ADANIPORTS",
"NSE:HEROMOTOCO","NSE:EICHERMOT","NSE:BRITANNIA","NSE:DIVISLAB",
"NSE:CIPLA","NSE:DRREDDY","NSE:APOLLOHOSP","NSE:HCLTECH",
"NSE:SBILIFE","NSE:BAJAJFINSV","NSE:UPL","NSE:BPCL",
"NSE:IOC","NSE:GAIL","NSE:DABUR","NSE:PIDILITIND","NSE:AMBUJACEM"
];

let state = {
  capital: 0,
  activeTrades: [],
  closedTrades: [],
  mode: LIVE ? "LIVE" : "PAPER"
};

let lastPrice = {};

// ===== CAPITAL =====
async function updateCapital() {
  try {
    const m = await kite.getMargins();
    state.capital = m?.equity?.available?.cash || m?.equity?.net || state.capital;
  } catch {}
}

// ===== SCORE ENGINE =====
function getScore(price, prev) {
  if (!prev) return 0;
  let score = 0;
  if (price > prev) score++;
  if (price > prev * 1.002) score++;
  if (price > prev * 1.004) score++;
  return score;
}

// ===== EXECUTION =====
async function executeOrder(symbol, qty, side) {
  if (!LIVE) return;
  const [exchange, tradingsymbol] = symbol.split(":");
  await kite.placeOrder("regular", {
    exchange,
    tradingsymbol,
    transaction_type: side,
    quantity: qty,
    product: "MIS",
    order_type: "MARKET",
    market_protection: 2
  });
}

// ===== LOOP =====
setInterval(async () => {
  if (!accessToken) return;

  await updateCapital();

  const quotes = await kite.getQuote(STOCKS);

  let signals = [];

  for (const sym of STOCKS) {
    const q = quotes[sym];
    if (!q) continue;

    const price = q.last_price;
    const score = getScore(price, lastPrice[sym]);

    lastPrice[sym] = price;

    if (score >= 2) {
      signals.push({ sym, score, price });
    }
  }

  // sort best signals
  signals.sort((a,b) => b.score - a.score);

  const top = signals.slice(0, 5);

  for (const s of top) {
    if (state.activeTrades.length >= 2) break;

    const qty = Math.max(1, Math.floor((state.capital * 0.02) / s.price));

    await executeOrder(s.sym, qty, "BUY");

    state.activeTrades.push({
      symbol: s.sym,
      entry: s.price,
      qty,
      sl: s.price * 0.995,
      target: s.price * 1.015
    });
  }

  // exits
  state.activeTrades = state.activeTrades.filter(tr => {
    const cp = lastPrice[tr.symbol];
    if (cp >= tr.target || cp <= tr.sl) {
      executeOrder(tr.symbol, tr.qty, "SELL");
      state.closedTrades.push(tr);
      return false;
    }
    return true;
  });

}, 3000);

// ===== ROUTES =====
app.get('/', (req,res)=>res.json(state));

app.listen(PORT, ()=>console.log("MULTI STOCK ENGINE RUNNING"));
