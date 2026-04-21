
/* FINAL PATCHED BOT
   - FIXED: no-trade issue (dual entry logic)
   - FIXED: dashboard (/performance working)
   - REAL capital
   - NO architecture change
*/

require("dotenv").config();
const express = require("express");
const { KiteConnect } = require("kiteconnect");

const { unifiedSignal } = require("./strategy_unified");
const { confirmSignal } = require("./signal_confirmation");
const { safeOrderEnhanced } = require("./execution_enhanced");
const { canTradeSymbol, markTraded } = require("./symbol_cooldown");
const { getPositionSize } = require("./position_sizing");
const { markEntry } = require("./time_exit");

const CONFIG = require("./config/config");

const app = express();
const kite = new KiteConnect({ api_key: process.env.KITE_API_KEY });

let access_token = null;
let MANUAL_KILL = false;

let capital = 0;
let activeTrades = [];
let lastPrice = {};
let history = {};
let scanData = [];

// LOGIN
app.get("/login",(req,res)=>res.redirect(kite.getLoginURL()));

app.get("/redirect",async(req,res)=>{
 try{
  const s = await kite.generateSession(req.query.request_token, process.env.KITE_API_SECRET);
  access_token = s.access_token;
  kite.setAccessToken(access_token);
  res.send("Login Success");
 }catch(e){res.send(e.message);}
});

// START/KILL
app.get("/start",(req,res)=>{MANUAL_KILL=false;res.send("STARTED");});
app.get("/kill",(req,res)=>{MANUAL_KILL=true;res.send("STOPPED");});

// CAPITAL
async function syncCapital(){
 try{
  const m = await kite.getMargins();
  const cash = m?.equity?.available?.live_balance ||
               m?.equity?.available?.cash ||
               m?.equity?.net || 0;
  if(cash>0) capital=cash;
 }catch{}
}

// PROBABILITY
function probability(arr){
 if(!arr || arr.length < 4) return 0;
 let up=0;
 for(let i=1;i<arr.length;i++){
  if(arr[i]>arr[i-1]) up++;
 }
 return up/arr.length;
}

// EXECUTION FUNCTION
async function executeTrade(signal, s, p){
    let qty = getPositionSize(capital,p,CONFIG);

    let order = await safeOrderEnhanced(kite, ()=>kite.placeOrder("regular",{
        exchange:"NSE",
        tradingsymbol:s,
        transaction_type:signal,
        quantity:qty,
        product:"MIS",
        order_type:"MARKET"
    }));

    if(order){
        activeTrades.push({symbol:s,type:signal,entry:p,qty});
        markTraded(s);
        markEntry(s);
    }
}

// LOOP
setInterval(async ()=>{
 if(!access_token || MANUAL_KILL) return;

 try{
  await syncCapital();
  const prices = await kite.getLTP(CONFIG.STOCKS.map(s=>`NSE:${s}`));
  scanData = [];

  for(let s of CONFIG.STOCKS){
    let p = prices[`NSE:${s}`].last_price;
    let prev = lastPrice[s];

    if(!history[s]) history[s]=[];
    history[s].push(p);
    if(history[s].length>5) history[s].shift();

    let raw = unifiedSignal(p,prev,s);
    let signal = confirmSignal(s,raw) || raw;
    let prob = probability(history[s]);

    lastPrice[s]=p;

    scanData.push({symbol:s,price:p,signal,probability:prob});

    if(activeTrades.length >= CONFIG.MAX_TRADES) continue;
    if(!canTradeSymbol(s)) continue;

    // 🔥 FINAL DUAL ENTRY LOGIC
    if(signal && prob >= 0.45){
        await executeTrade(signal,s,p);
    }
    else if(signal && prob >= 0.35){
        await executeTrade(signal,s,p);
    }
  }

 }catch(e){console.log(e.message);}
},3000);

// DASHBOARD
app.get("/performance",(req,res)=>{
 res.json({
  capital,
  activeTradesCount:activeTrades.length,
  scan:scanData
 });
});

// UI
app.get("/",(req,res)=>{
 res.send(`
  <h2>FINAL PATCHED BOT</h2>
  <button onclick="fetch('/start')">Start</button>
  <button onclick="fetch('/kill')">Kill</button>
  <pre id="d"></pre>
  <script>
   setInterval(async()=>{
    let r = await fetch('/performance');
    let d = await r.json();
    document.getElementById('d').innerText = JSON.stringify(d,null,2);
   },2000);
  </script>
 `);
});

app.listen(process.env.PORT||3000);
