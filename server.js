
require("dotenv").config();
const express = require("express");
const axios = require("axios");
const fs = require("fs");
const { KiteConnect } = require("kiteconnect");

const app = express();
const kite = new KiteConnect({ api_key: process.env.KITE_API_KEY });

let access_token=null;
let BOT_ACTIVE=false;

let capital=0;
let pnl=0;
let activeTrades=[];
let closedTrades=[];
let history={};
let scanOutput=[];

// --- RISK CONTROLS ---
let dayStartEquity = null; // set on first capital fetch after start
const DAILY_LOSS_PCT = 0.02; // 2%
const MAX_ACTIVE = 5;

// --- TIME EXIT ---
const MAX_HOLD_MS = 8 * 60 * 1000; // 8 minutes

// --- STOCK LIST (extendable to 200+) ---
const STOCKS = [
"RELIANCE","TCS","INFY","HDFCBANK","ICICIBANK","SBIN","ITC","LT","AXISBANK","KOTAKBANK",
"HCLTECH","WIPRO","ULTRACEMCO","BAJFINANCE","MARUTI","ASIANPAINT","TITAN","SUNPHARMA"
];

// --- MARKET REGIME ---
function getMarketRegime(hist){
 if(hist.length<6) return "UNKNOWN";
 let moves=0;
 for(let i=1;i<hist.length;i++){
  moves += Math.abs(hist[i]-hist[i-1]);
 }
 let avgMove = moves/hist.length;
 if(avgMove < 0.5) return "SIDEWAYS";
 if(avgMove < 1.5) return "NORMAL";
 return "VOLATILE";
}

// --- PROBABILITY ---
function prob(a){
 if(a.length<4) return 0;
 let up=0;
 for(let i=1;i<a.length;i++) if(a[i]>a[i-1]) up++;
 return up/a.length;
}

// --- CAPITAL ---
async function updateCapital(){
 try{
  let m=await kite.getMargins();
  capital = m?.equity?.available?.cash || m?.equity?.net || 0;
  if(dayStartEquity === null && capital>0){
    dayStartEquity = capital;
  }
 }catch(e){}
}

// --- POSITION SIZE (confidence-based) ---
function positionSize(price, confidence){
 // base = 1 lot share count proxy
 // scale 1x to 3x based on confidence
 let mult = confidence >= 0.6 ? 3 : (confidence >= 0.5 ? 2 : 1);
 return Math.max(1, mult);
}

// --- UI ---
app.get("/",(req,res)=>{
 res.send(`
 <h2>FINAL PROFIT OPTIMIZER</h2>
 <button onclick="location.href='/login'">Login</button>
 <button onclick="fetch('/start')">Start</button>
 <button onclick="fetch('/kill')">Kill</button>
 <pre id="data"></pre>
 <script>
 setInterval(async()=>{
  let r=await fetch('/performance');
  let d=await r.json();
  document.getElementById('data').innerText=JSON.stringify(d,null,2);
 },2000);
 </script>
 `);
});

// --- LOGIN ---
app.get("/login",(req,res)=>res.redirect(kite.getLoginURL()));

app.get("/redirect",async(req,res)=>{
 try{
  const s=await kite.generateSession(req.query.request_token,process.env.KITE_API_SECRET);
  access_token=s.access_token;
  kite.setAccessToken(access_token);
  BOT_ACTIVE=true;

  let ipRes=await axios.get("https://api.ipify.org?format=json");
  res.send("Login Success. IP: "+ipRes.data.ip);

 }catch(e){
  res.send("Login failed");
 }
});

app.get("/start",(req,res)=>{BOT_ACTIVE=true;res.send("STARTED");});
app.get("/kill",(req,res)=>{BOT_ACTIVE=false;res.send("STOPPED");});

// --- LOOP ---
setInterval(async()=>{
 if(!access_token || !BOT_ACTIVE) return;

 try{
  await updateCapital();

  // --- DAILY LOSS GUARD ---
  if(dayStartEquity && capital){
    let drawdown = (dayStartEquity - capital) / dayStartEquity;
    if(drawdown >= DAILY_LOSS_PCT){
      BOT_ACTIVE = false;
      console.log("DAILY LOSS GUARD TRIGGERED");
      return;
    }
  }

  const prices=await kite.getLTP(STOCKS.map(s=>"NSE:"+s));
  scanOutput=[];

  for(let s of STOCKS){

    let p=prices["NSE:"+s]?.last_price;
    if(!p) continue;

    if(!history[s]) history[s]=[];
    history[s].push(p);
    if(history[s].length>8) history[s].shift();

    let pr=prob(history[s]);
    let regime=getMarketRegime(history[s]);

    let signal=null;
    let reason="No edge";
    let confidence=pr;

    // --- REGIME + SIGNAL ---
    if(regime==="SIDEWAYS"){
      reason="Skipped (sideways)";
    }
    else if(pr>=0.5){
      signal = history[s].at(-1)>history[s].at(-2)?"BUY":"SELL";
      reason="Strong momentum + valid regime";
    }
    else if(pr>=0.3 && regime==="VOLATILE"){
      signal = history[s].at(-1)>history[s].at(-2)?"BUY":"SELL";
      reason="Volatile scout";
    }

    scanOutput.push({
      symbol:s,
      price:p,
      probability:pr,
      regime,
      signal,
      reason,
      confidence
    });

    if(signal && !activeTrades.find(t=>t.symbol===s) && activeTrades.length<MAX_ACTIVE){

      let qty = positionSize(p, confidence);

      await kite.placeOrder("regular",{
        exchange:"NSE",
        tradingsymbol:s,
        transaction_type:signal,
        quantity:qty,
        product:"MIS",
        order_type:"MARKET",
        market_protection:2
      });

      activeTrades.push({
        symbol:s,
        entry:p,
        type:signal,
        qty,
        time:Date.now(),
        peak:p // for trailing
      });
    }
  }

  // --- MANAGE TRADES ---
  let unreal=0;
  let remaining=[];

  for(let t of activeTrades){
    let cp=prices["NSE:"+t.symbol]?.last_price;
    if(!cp) continue;

    // update peak for trailing
    if(t.type==="BUY"){
      if(cp > t.peak) t.peak = cp;
    } else {
      if(cp < t.peak) t.peak = cp;
    }

    let profit = t.type==="BUY"?(cp-t.entry):(t.entry-cp);

    // --- TRAILING STOP ---
    let trailHit = false;
    if(t.type==="BUY"){
      trailHit = (t.peak - cp) >= (t.entry * 0.002); // 0.2%
    } else {
      trailHit = (cp - t.peak) >= (t.entry * 0.002);
    }

    // --- TIME EXIT ---
    let timeExit = (Date.now() - t.time) > MAX_HOLD_MS;

    // --- TP/SL ---
    let tp = profit > t.entry*0.0035;
    let sl = profit < -t.entry*0.002;

    if(tp || sl || trailHit || timeExit){

      let finalPnl = profit * t.qty;

      await kite.placeOrder("regular",{
        exchange:"NSE",
        tradingsymbol:t.symbol,
        transaction_type: t.type==="BUY"?"SELL":"BUY",
        quantity:t.qty,
        product:"MIS",
        order_type:"MARKET",
        market_protection:2
      });

      closedTrades.push({symbol:t.symbol, pnl:finalPnl, exitReason: tp?"TP": sl?"SL": trailHit?"TRAIL":"TIME"});

    } else {
      unreal += profit * t.qty;
      remaining.push(t);
    }
  }

  activeTrades = remaining;

  let realized = closedTrades.reduce((a,b)=>a+b.pnl,0);
  pnl = realized + unreal;

 }catch(e){
  console.log("ERROR:", e.message);
 }

},3000);

// --- PERFORMANCE ---
app.get("/performance",(req,res)=>{
 res.json({
  botActive: BOT_ACTIVE,
  capital,
  pnl,
  dayStartEquity,
  activeTradesCount: activeTrades.length,
  closedTradesCount: closedTrades.length,
  scan: scanOutput,
  activeTrades,
  closedTrades
 });
});

app.listen(process.env.PORT||3000);
