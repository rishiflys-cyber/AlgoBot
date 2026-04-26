
require('dotenv').config();
const express = require('express');
const fs = require('fs');
const axios = require('axios');
const KiteConnect = require("kiteconnect").KiteConnect;

const app = express();
const PORT = process.env.PORT || 3000;

const LIVE = process.env.LIVE_TRADING === "true";
const TOKEN_FILE = "access_token.json";

let kite = new KiteConnect({ api_key: process.env.KITE_API_KEY });
let accessToken = null;

if (fs.existsSync(TOKEN_FILE)) {
  const saved = JSON.parse(fs.readFileSync(TOKEN_FILE));
  accessToken = saved.token;
  kite.setAccessToken(accessToken);
}

const STOCKS = ["NSE:RELIANCE","NSE:TCS","NSE:INFY","NSE:HDFCBANK","NSE:ICICIBANK"];

let state = {
  capital: 0,
  pnl: 0,
  activeTrades: [],
  closedTrades: [],
  serverIP: null,
  mode: LIVE ? "LIVE" : "PAPER"
};

let lastPrice = {};
let lastTradeTime = {};
const COOLDOWN = 300000;

// LOGIN
app.get('/login', (req,res)=>res.redirect(kite.getLoginURL()));

app.get('/redirect', async (req,res)=>{
  try{
    const session = await kite.generateSession(req.query.request_token, process.env.KITE_API_SECRET);
    accessToken = session.access_token;
    kite.setAccessToken(accessToken);
    fs.writeFileSync(TOKEN_FILE, JSON.stringify({token: accessToken}));

    const ip = await axios.get("https://api.ipify.org?format=json");
    state.serverIP = ip.data.ip;

    res.send("Login success | IP: " + state.serverIP);
  }catch(e){
    res.send("Login failed: " + e.message);
  }
});

// CAPITAL
async function updateCapital(){
  try{
    const m = await kite.getMargins();
    state.capital = m?.equity?.available?.cash || m?.equity?.net || state.capital;
  }catch(e){
    console.log("MARGIN ERROR:", e.message);
  }
}

// SCORE
function getScore(price, prev){
  if(!prev) return 0;
  let s=0;
  if(price>prev) s++;
  if(price>prev*1.002) s++;
  if(price>prev*1.004) s++;
  return s;
}

// EXECUTION
async function executeOrder(symbol, qty, side){
  if(!LIVE) return;
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

// LOOP
setInterval(async ()=>{
  if(!accessToken) return;

  if(state.pnl < -200) return; // kill switch

  await updateCapital();

  const quotes = await kite.getQuote(STOCKS);

  for(const sym of STOCKS){
    const q = quotes[sym];
    if(!q) continue;

    const price = q.last_price;

    // trend filter
    if (price < q.ohlc.open) continue;

    // cooldown
    if (lastTradeTime[sym] && Date.now() - lastTradeTime[sym] < COOLDOWN) continue;

    const score = getScore(price, lastPrice[sym]);
    lastPrice[sym]=price;

    if(score < 3) continue;

    if(state.activeTrades.length >= 2) break;

    const qty = Math.max(1, Math.floor((state.capital * 0.01) / price));
    if(qty <= 0) continue;

    const volatility = price * 0.003;

    await executeOrder(sym, qty, "BUY");

    lastTradeTime[sym] = Date.now();

    state.activeTrades.push({
      symbol:sym,
      entry:price,
      qty,
      sl:price - volatility,
      target:price + (volatility*2),
      entryTime: Date.now(),
      score
    });
  }

  // exits
  state.activeTrades = state.activeTrades.filter(tr=>{
    const cp = lastPrice[tr.symbol];
    if(cp >= tr.target || cp <= tr.sl){
      const pnl = (cp - tr.entry) * tr.qty;
      state.pnl += pnl;

      executeOrder(tr.symbol, tr.qty, "SELL");

      state.closedTrades.push({
        ...tr,
        exit: cp,
        pnl,
        exitTime: Date.now()
      });

      return false;
    }
    return true;
  });

},3000);

// ROUTES
app.get('/', (req,res)=>res.json(state));
app.get('/performance', (req,res)=>res.json(state));

app.listen(PORT, ()=>console.log("PROFIT OPTIMIZED V14 RUNNING"));
