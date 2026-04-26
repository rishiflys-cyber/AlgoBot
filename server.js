
require('dotenv').config();
const express = require('express');
const KiteConnect = require("kiteconnect").KiteConnect;

const app = express();
const PORT = process.env.PORT || 3000;

let kite = new KiteConnect({ api_key: process.env.KITE_API_KEY });
let accessToken = process.env.ACCESS_TOKEN || null;

if (accessToken) kite.setAccessToken(accessToken);

// STATE
let capital = 0;
let activeTrades = [];
let closedTrades = [];

// LOGIN
app.get('/login', (req, res) => res.redirect(kite.getLoginURL()));

app.get('/redirect', async (req, res) => {
  const session = await kite.generateSession(req.query.request_token, process.env.KITE_API_SECRET);
  accessToken = session.access_token;
  kite.setAccessToken(accessToken);
  res.send("Login success");
});

// CAPITAL
async function updateCapital() {
  if (!accessToken) return;
  const m = await kite.getMargins();
  capital = m?.equity?.available?.cash || m?.equity?.net || capital;
}

// TRAILING SL + DYNAMIC EXIT
function manageTrade(trade, currentPrice) {
  if (trade.side === "BUY") {
    if (currentPrice > trade.entry) {
      trade.stopLoss = Math.max(trade.stopLoss, currentPrice * 0.995);
    }

    if (currentPrice < trade.stopLoss) return "EXIT";
  }
  return "HOLD";
}

// LOOP
setInterval(async () => {
  if (!accessToken) return;

  await updateCapital();

  const symbols = ["NSE:RELIANCE","NSE:TCS","NSE:INFY"];
  const quotes = await kite.getQuote(symbols);

  // MANAGE TRADES
  activeTrades = activeTrades.filter(tr => {
    const q = quotes[tr.symbol];
    if (!q) return true;

    const decision = manageTrade(tr, q.last_price);

    if (decision === "EXIT") {
      closedTrades.push({
        ...tr,
        exit: q.last_price
      });
      return false;
    }
    return true;
  });

  // MOCK ENTRY (for testing)
  if (activeTrades.length < 3) {
    const sym = symbols[Math.floor(Math.random() * symbols.length)];
    const q = quotes[sym];
    if (!q) return;

    activeTrades.push({
      symbol: sym,
      side: "BUY",
      entry: q.last_price,
      stopLoss: q.last_price * 0.99
    });
  }

}, 3000);

// ROUTES
app.get('/', (req, res) => {
  res.json({
    capital,
    activeTrades,
    closedTrades
  });
});

app.listen(PORT, () => console.log("Trade Management Engine Running"));
