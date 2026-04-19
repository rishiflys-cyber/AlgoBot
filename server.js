
/* AUTO START 9:20 IST + AUTO EXIT 2:45 IST (NO LOGIC CHANGE) */

require("dotenv").config();
const express = require("express");
const { KiteConnect } = require("kiteconnect");

const { unifiedSignal } = require("./strategy_unified");
const { confirmSignal } = require("./signal_confirmation");
const { safeOrderEnhanced } = require("./execution_enhanced");
const { canTradeSymbol, markTraded } = require("./symbol_cooldown");
const { getPositionSize } = require("./position_sizing");
const { markEntry } = require("./time_exit");
const { isSlippageSafe } = require("./slippage_guard");
const { isHighQualityMove } = require("./quality_filter");
const { isMomentumStrong } = require("./momentum_strength");
const { isDrawdownSafe } = require("./drawdown_guard");

const CONFIG = require("./config/config");

const app = express();
const kite = new KiteConnect({ api_key: process.env.KITE_API_KEY });

let access_token = null;
let MANUAL_KILL = true;

let AUTO_STARTED = false;
let AUTO_SQUARED = false;

let capital = 0;
let activeTrades = [];
let lastPrice = {}, history = {}, scanData = [];

// LOGIN
app.get("/login",(req,res)=>res.redirect(kite.getLoginURL()));
app.get("/redirect",async(req,res)=>{
 try{
  const s=await kite.generateSession(req.query.request_token,process.env.KITE_API_SECRET);
  access_token=s.access_token;
  kite.setAccessToken(access_token);
  res.send("Login Success");
 }catch(e){res.send(e.message);}
});

// IST TIME
function getISTMinutes(){
 const now=new Date();
 const ist=new Date(now.toLocaleString("en-US",{timeZone:"Asia/Kolkata"}));
 return ist.getHours()*60+ist.getMinutes();
}

// CAPITAL
async function syncCapital(){
 try{
  const m=await kite.getMargins();
  const cash=m?.equity?.available?.live_balance||
             m?.equity?.available?.cash||
             m?.equity?.net||0;
  if(cash>0) capital=cash;
 }catch{}
}

// LOOP
setInterval(async()=>{
 if(!access_token) return;

 const current = getISTMinutes();

 // RESET DAILY
 if(current < 550){
  AUTO_STARTED = false;
  AUTO_SQUARED = false;
 }

 // AUTO START 9:20
 if(current >= 560 && current < 565 && !AUTO_STARTED){
  MANUAL_KILL = false;
  AUTO_STARTED = true;
  console.log("AUTO STARTED IST 9:20");
 }

 // AUTO EXIT 2:45
 if(current >= 885 && !AUTO_SQUARED){
  console.log("AUTO EXIT IST 2:45");

  activeTrades.forEach(t=>{
    safeOrderEnhanced(kite,()=>kite.placeOrder("regular",{
      exchange:"NSE",
      tradingsymbol:t.symbol,
      transaction_type:t.type==="BUY"?"SELL":"BUY",
      quantity:t.qty,
      product:"MIS",
      order_type:"MARKET"
    }));
  });

  activeTrades=[];
  MANUAL_KILL=true;
  AUTO_SQUARED=true;
 }

 if(MANUAL_KILL) return;

 try{
  await syncCapital();

  const prices=await kite.getLTP(CONFIG.STOCKS.map(s=>`NSE:${s}`));
  scanData=[];

  for(let s of CONFIG.STOCKS){
    let p=prices[`NSE:${s}`].last_price;
    let prev=lastPrice[s];

    if(!history[s]) history[s]=[];
    history[s].push(p);
    if(history[s].length>6) history[s].shift();

    let raw=unifiedSignal(p,prev,s);
    let signal=confirmSignal(s,raw)||raw;

    lastPrice[s]=p;

    scanData.push({symbol:s,price:p,signal});

    if(signal &&
       activeTrades.length<CONFIG.MAX_TRADES &&
       isDrawdownSafe(0,capital) &&
       canTradeSymbol(s) &&
       isSlippageSafe(prev,p) &&
       isHighQualityMove(prev,p) &&
       isMomentumStrong(history[s])){

        let qty=getPositionSize(capital,p,CONFIG);

        let order=await safeOrderEnhanced(kite,()=>kite.placeOrder("regular",{
          exchange:"NSE",
          tradingsymbol:s,
          transaction_type:signal,
          quantity:qty,
          product:"MIS",
          order_type:"MARKET"
        }));

        if(order){
          activeTrades.push({symbol:s,type:signal,entry:p,qty});
          markTraded(s); markEntry(s);
        }
    }
  }

 }catch(e){console.log(e.message);}
},3000);

// UI
app.get("/",(req,res)=>{
 res.send(`
  <h2>Auto Bot (IST Timed)</h2>
  <pre id="d"></pre>
  <script>
   setInterval(async()=>{
    let r=await fetch('/performance');
    let d=await r.json();
    document.getElementById('d').innerText=JSON.stringify(d,null,2);
   },2000);
  </script>
 `);
});

// API
app.get("/performance",(req,res)=>{
 res.json({
  capital,
  activeTradesCount:activeTrades.length,
  scan:scanData,
  autoStarted:AUTO_STARTED,
  autoSquared:AUTO_SQUARED
 });
});

app.listen(process.env.PORT||3000);
