
require('dotenv').config();
const express = require('express');
const fs = require('fs');
const KiteConnect = require("kiteconnect").KiteConnect;

const app = express();
const PORT = process.env.PORT || 3000;

const LIVE = process.env.LIVE_TRADING === "true";
const TOKEN_FILE = "access_token.json";

let kite = new KiteConnect({ api_key: process.env.KITE_API_KEY });
let accessToken = null;

let state = {
  capital: 0,
  activeTrades: [],
  closedTrades: [],
  mode: LIVE ? "LIVE" : "PAPER"
};

// LOAD TOKEN
if(fs.existsSync(TOKEN_FILE)){
  try{
    const saved = JSON.parse(fs.readFileSync(TOKEN_FILE));
    accessToken = saved.token;
    kite.setAccessToken(accessToken);
  }catch{}
}

// LOGIN
app.get('/login',(req,res)=>res.redirect(kite.getLoginURL()));

app.get('/redirect', async(req,res)=>{
  try{
    const session = await kite.generateSession(req.query.request_token, process.env.KITE_API_SECRET);
    accessToken = session.access_token;
    kite.setAccessToken(accessToken);
    fs.writeFileSync(TOKEN_FILE, JSON.stringify({token:accessToken}));
    res.send("Login success");
  }catch{
    res.send("Login failed");
  }
});

// CAPITAL
async function updateCapital(){
  try{
    const m = await kite.getMargins();
    state.capital = m?.equity?.available?.cash || m?.equity?.net || 0;
  }catch{}
}

// EXECUTION
async function placeSell(sym, qty){
  if(!LIVE) return;
  const [exchange, tradingsymbol] = sym.split(":");

  await kite.placeOrder("regular",{
    exchange,
    tradingsymbol,
    transaction_type:"SELL",
    quantity:qty,
    product:"MIS",
    order_type:"MARKET",
    market_protection:2
  });
}

// ===== SMART EXIT ENGINE =====
function manageTrades(){
  const now = Date.now();

  for(let trade of state.activeTrades){

    // TRAILING SL
    const trail = trade.entry * 0.01;
    if(trade.price > trade.entry){
      trade.sl = Math.max(trade.sl, trade.price - trail);
    }

    // PARTIAL BOOKING
    if(!trade.partialBooked && trade.price >= trade.entry * 1.02){
      trade.qty = Math.floor(trade.qty / 2);
      trade.partialBooked = true;
    }

    // TIME EXIT (15 min)
    if(now - trade.startTime > 15 * 60 * 1000){
      trade.exitReason = "TIME_EXIT";
      closeTrade(trade);
      continue;
    }

    // STOP LOSS
    if(trade.price <= trade.sl){
      trade.exitReason = "SL";
      closeTrade(trade);
      continue;
    }

    // TARGET
    if(trade.price >= trade.target){
      trade.exitReason = "TARGET";
      closeTrade(trade);
      continue;
    }
  }
}

async function closeTrade(trade){
  await placeSell(trade.symbol, trade.qty);

  state.closedTrades.push({
    symbol: trade.symbol,
    entry: trade.entry,
    exit: trade.price,
    reason: trade.exitReason
  });

  state.activeTrades = state.activeTrades.filter(t=>t!==trade);
}

// MOCK PRICE UPDATE
setInterval(()=>{
  for(let t of state.activeTrades){
    t.price = t.price * (1 + (Math.random()-0.5)*0.01);
  }
},2000);

// MAIN LOOP
setInterval(async()=>{
  if(!accessToken) return;

  await updateCapital();

  // dummy trade creation (for demo)
  if(state.activeTrades.length < 3){
    state.activeTrades.push({
      symbol:"NSE:RELIANCE",
      entry:1000,
      price:1000,
      qty:10,
      sl:990,
      target:1030,
      startTime: Date.now(),
      partialBooked:false
    });
  }

  manageTrades();

},3000);

// ROUTES
app.get('/',(req,res)=>res.json(state));
app.get('/performance',(req,res)=>res.json(state));

app.listen(PORT, ()=>console.log("V32 SMART EXIT SYSTEM"));
