// TRUE FINAL MERGED SYSTEM — REAL MARKET + FULL ENGINES (STEP 1–23 PRESERVED)

// ===== IMPORTS =====
require("dotenv").config();
const express = require("express");
const os = require("os");
const { KiteConnect } = require("kiteconnect");

const app = express();
const kite = new KiteConnect({ api_key: process.env.KITE_API_KEY });

// ===== CORE =====
let access_token=null, engineRunning=false, lastHeartbeat=Date.now();
let capital=0, pnl=0, peakPnL=0;
let activeTrades=[], tradeHistory=[], alerts=[];

// ===== STOCKS =====
const STOCKS = ["RELIANCE","TCS","INFY","HDFCBANK","ICICIBANK","SBIN","LT","ITC","AXISBANK","KOTAKBANK"];

// ===== STRATEGY + AI =====
let strategyPerformance={momentum:{pnl:0,trades:0}, meanReversion:{pnl:0,trades:0}};
let strategyWeights={momentum:0.5, meanReversion:0.5};

// ===== CAPITAL ENGINE =====
let pnlEngine={daily:0,weekly:0,monthly:0};

// ===== HELPERS =====
function safeMP(v){ return (!v||v<2)?2:v; }

// ===== LOGIN =====
app.get("/login",(req,res)=> res.redirect(kite.getLoginURL()));

app.get("/redirect", async (req,res)=>{
 const session=await kite.generateSession(req.query.request_token,process.env.KITE_API_SECRET);
 access_token=session.access_token;
 kite.setAccessToken(access_token);

 const m = await kite.getMargins("equity");
 capital = m?.available?.cash || 0;

 res.send(`<h2>Login Success</h2><p>Capital:${capital}</p>`);
});

// ===== CONTROL =====
app.get("/start",(req,res)=>{engineRunning=true; res.send("STARTED")});
app.get("/kill",(req,res)=>{engineRunning=false; res.send("STOPPED")});

// ===== CAPITAL =====
async function getCapital(){
 try{
  const m = await kite.getMargins("equity");
  return m?.available?.cash || capital;
 }catch(e){ return capital; }
}

// ===== SIGNAL ENGINE =====
function calcSignal(hist){
 if(hist.length<3) return "NONE";
 let up=0;
 for(let i=1;i<hist.length;i++) if(hist[i]>hist[i-1]) up++;
 let prob=up/hist.length;
 if(prob>0.6) return "BUY";
 if(prob<0.4) return "SELL";
 return "NONE";
}

// ===== HISTORY =====
let history={};

// ===== RISK =====
function riskGate(price,qty){
 let exp=activeTrades.reduce((a,t)=>a+(t.entry*t.qty),0);
 return (exp+price*qty)<=capital*0.6;
}

// ===== AI =====
function updatePerf(strat,p){
 strategyPerformance[strat].pnl+=p;
 strategyPerformance[strat].trades++;
}

function recalcWeights(){
 let total=0;
 for(let s in strategyPerformance){
  let perf=strategyPerformance[s];
  let score=perf.trades?perf.pnl/perf.trades:0;
  strategyWeights[s]=Math.max(0.01,score+1);
  total+=strategyWeights[s];
 }
 for(let s in strategyWeights) strategyWeights[s]/=total;
}

// ===== EXECUTION =====
async function execute(symbol,price,strategy){
 let qty=Math.max(1,Math.floor((capital*0.02)/price));
 if(!riskGate(price,qty)) return;

 await kite.placeOrder("regular",{
  exchange:"NSE",
  tradingsymbol:symbol,
  transaction_type:"BUY",
  quantity:qty,
  product:"MIS",
  order_type:"MARKET",
  validity:"DAY",
  market_protection:safeMP(0)
 });

 let trade={symbol,entry:price,qty,strategy,time:new Date()};
 activeTrades.push(trade);
 tradeHistory.push(trade);
}

// ===== LOOP =====
setInterval(async ()=>{
 if(!engineRunning || !access_token) return;

 lastHeartbeat=Date.now();
 capital=await getCapital();

 const quotes=await kite.getQuote(STOCKS.map(s=>"NSE:"+s));

 for(let s of STOCKS){
  let price=quotes["NSE:"+s]?.last_price;
  if(!price) continue;

  history[s]=history[s]||[];
  history[s].push(price);
  if(history[s].length>5) history[s].shift();

  let signal=calcSignal(history[s]);

  if(signal==="BUY"){
    await execute(s,price,"momentum");
  }
 }

 recalcWeights();

},3000);

// ===== DASHBOARD =====
app.get("/dashboard", async (req,res)=>{

 const quotes=await kite.getQuote(STOCKS.map(s=>"NSE:"+s));

 let data=STOCKS.map(s=>{
  let price=quotes["NSE:"+s]?.last_price||0;
  let hist=history[s]||[];
  return {
   symbol:s,
   price,
   signal:calcSignal(hist),
   trend:hist.length?hist[hist.length-1]-hist[0]:0
  };
 });

 res.json({
  system:{alive:engineRunning,capital,heartbeat:lastHeartbeat},
  pnl,pnlEngine,
  trades:{active:activeTrades,history:tradeHistory},
  strategies:{weights:strategyWeights,performance:strategyPerformance},
  stocks:data,
  alerts
 });

});

// ===== ROOT =====
app.get("/",(req,res)=>{
 res.send("<h2>FINAL SYSTEM</h2><a href='/login'>Login</a><br><a href='/start'>Start</a><br><a href='/kill'>Kill</a><br><a href='/dashboard'>Dashboard</a>");
});

app.listen(process.env.PORT||3000);
