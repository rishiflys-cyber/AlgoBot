require("dotenv").config();
const express = require("express");
const path = require("path");
const { KiteConnect } = require("kiteconnect");

const { STOCKS, ...CONFIG } = require("../config/config");
const { combinedSignal } = require("../strategies/strategies");
const { checkKillSwitch, qty } = require("../risk/risk");
const { placeEntry, placeExit } = require("../execution/execution");

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "../ui")));

const kite = new KiteConnect({ api_key: process.env.KITE_API_KEY });

let access_token=null, BOT_ACTIVE=false;
let capital=0, tradesToday=0;
let activeTrade=null;
let lastScan=[];
let lossStreak=0, dailyPnL=0;
let last={};

function isMarketTime(){
  let now=new Date();
  let t=now.getHours()*60+now.getMinutes();
  let start = CONFIG.MARKET_TIME.start.h*60 + CONFIG.MARKET_TIME.start.m;
  let end = CONFIG.MARKET_TIME.end.h*60 + CONFIG.MARKET_TIME.end.m;
  return t>=start && t<=end;
}

app.get("/login",(req,res)=>res.redirect(kite.getLoginURL()));
app.get("/redirect", async (req,res)=>{
  const s = await kite.generateSession(req.query.request_token, process.env.KITE_API_SECRET);
  access_token = s.access_token;
  kite.setAccessToken(access_token);
  res.send("OK");
});

app.get("/start",(req,res)=>{ BOT_ACTIVE=true; res.send("START"); });
app.get("/kill",(req,res)=>{ BOT_ACTIVE=false; res.send("STOP"); });
app.get("/status",(req,res)=>res.json(lastScan));

setInterval(async ()=>{
  if(!BOT_ACTIVE || !access_token) return;
  if(!isMarketTime()) return;
  if(!checkKillSwitch(dailyPnL, capital, lossStreak, CONFIG)) return;

  let prices = await kite.getLTP(STOCKS.map(s=>`NSE:${s}`));
  if(!prices) return;

  lastScan=[];
  let best=null, bestScore=0;

  for(let s of STOCKS){
    let p = prices[`NSE:${s}`].last_price;
    let prev = last[s];
    let sc = prev ? Math.abs((p-prev)/prev) : 0;
    let sig = combinedSignal(p, prev);

    let decision = (sc>CONFIG.BASE_SCORE && sig) ? "READY" : "SKIP";
    lastScan.push({symbol:s, price:p, score:sc, signal:sig, decision});

    if(sc>bestScore){
      bestScore=sc;
      best={symbol:s, price:p, prev, signal:sig};
    }
    last[s]=p;
  }

  if(activeTrade){
    let p = prices[`NSE:${activeTrade.symbol}`].last_price;
    let exit=false, pnl=0;

    if(activeTrade.type==="BUY"){
      if(p<=activeTrade.entry*(1-CONFIG.SL) || p>=activeTrade.entry*(1+CONFIG.TP)) exit=true;
      pnl=(p-activeTrade.entry)*activeTrade.qty;
    } else {
      if(p>=activeTrade.entry*(1+CONFIG.SL) || p<=activeTrade.entry*(1-CONFIG.TP)) exit=true;
      pnl=(activeTrade.entry-p)*activeTrade.qty;
    }

    if(exit){
      await placeExit(kite, activeTrade.symbol, activeTrade.type, activeTrade.qty);
      dailyPnL += pnl;
      if(pnl<0) lossStreak++; else lossStreak=0;
      activeTrade=null;
    }
    return;
  }

  if(tradesToday>=CONFIG.MAX_TRADES) return;
  if(!best || !best.signal) return;

  let q = qty(capital, best.price, CONFIG);
  await placeEntry(kite, best.symbol, best.signal, q, best.price);

  activeTrade={symbol:best.symbol, type:best.signal, entry:best.price, qty:q};
  tradesToday++;
}, 3000);

const PORT = process.env.PORT || 3000;
app.listen(PORT, ()=>console.log("INSTITUTIONAL STRUCTURED BOT RUNNING"));