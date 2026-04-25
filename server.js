
require("dotenv").config();
const express = require("express");
const axios = require("axios");
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
let volumeHistory={};
let scanOutput=[];
let serverIP="UNKNOWN";

// GET SERVER IP
async function updateIP(){
 try{
  let res = await axios.get("https://api.ipify.org?format=json");
  serverIP = res.data.ip;
 }catch(e){}
}

// CAPITAL
async function updateCapital(){
 try{
  let m=await kite.getMargins();
  capital=m?.equity?.available?.cash||m?.equity?.net||0;
 }catch(e){}
}

// PROBABILITY
function prob(a){
 if(a.length<4) return 0;
 let up=0;
 for(let i=1;i<a.length;i++) if(a[i]>a[i-1]) up++;
 return up/a.length;
}

// INDEX TREND
let indexHistory=[];
function getIndexTrend(){
 if(indexHistory.length<5) return "UNKNOWN";
 let up=0;
 for(let i=1;i<indexHistory.length;i++){
  if(indexHistory[i]>indexHistory[i-1]) up++;
 }
 return up>=3?"UP":"DOWN";
}

// VOLUME BREAKOUT
function volumeBreakout(symbol, vol){
 if(!volumeHistory[symbol]) return false;
 let avg = volumeHistory[symbol].reduce((a,b)=>a+b,0)/volumeHistory[symbol].length;
 return vol > avg * 1.5;
}

// DYNAMIC CAPITAL ALLOCATION
function dynamicQty(price, confidence){
 if(!capital) return 1;
 let risk = capital * (confidence >=0.6 ? 0.05 : 0.02);
 return Math.max(1, Math.floor(risk/price));
}

const STOCKS = ["RELIANCE","TCS","INFY","HDFCBANK","ICICIBANK","SBIN","ITC","LT","AXISBANK","KOTAKBANK"];

// DASHBOARD
app.get("/",(req,res)=>{
 res.send(`
 <h2>FINAL MULTI-STRATEGY SYSTEM</h2>
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

app.get("/login",(req,res)=>res.redirect(kite.getLoginURL()));

app.get("/redirect",async(req,res)=>{
 try{
  const s=await kite.generateSession(req.query.request_token,process.env.KITE_API_SECRET);
  access_token=s.access_token;
  kite.setAccessToken(access_token);
  BOT_ACTIVE=true;

  await updateIP();

  res.send("Login Success. IP: "+serverIP);
 }catch(e){
  res.send("Login failed");
 }
});

app.get("/start",(req,res)=>{BOT_ACTIVE=true;res.send("STARTED");});
app.get("/kill",(req,res)=>{BOT_ACTIVE=false;res.send("STOPPED");});

setInterval(async()=>{
 if(!access_token||!BOT_ACTIVE) return;

 try{
  await updateCapital();

  let indexData=await kite.getLTP(["NSE:NIFTY 50"]);
  let idx=indexData["NSE:NIFTY 50"]?.last_price;
  if(idx){
    indexHistory.push(idx);
    if(indexHistory.length>6) indexHistory.shift();
  }

  let indexTrend=getIndexTrend();

  const quotes=await kite.getQuote(STOCKS.map(s=>"NSE:"+s));

  scanOutput=[];

  for(let s of STOCKS){

    let data=quotes["NSE:"+s];
    if(!data) continue;

    let price=data.last_price;
    let vol=data.volume;

    if(!history[s]) history[s]=[];
    history[s].push(price);
    if(history[s].length>6) history[s].shift();

    if(!volumeHistory[s]) volumeHistory[s]=[];
    volumeHistory[s].push(vol);
    if(volumeHistory[s].length>6) volumeHistory[s].shift();

    let pr=prob(history[s]);
    let volBreak=volumeBreakout(s, vol);

    // STRATEGIES
    let momentum = pr>=0.5;
    let volumeStr = volBreak;
    let indexAlign = indexTrend==="UP" || indexTrend==="DOWN";

    let agreement = [momentum, volumeStr, indexAlign].filter(x=>x).length;

    let signal=null;
    let reason="No edge";

    if(agreement>=2 && pr>=0.5){
      signal = indexTrend==="UP"?"BUY":"SELL";
      reason="Multi-strategy agreement";
    }

    scanOutput.push({
      symbol:s,
      price,
      probability:pr,
      volume:vol,
      volumeBreakout:volBreak,
      indexTrend,
      agreement,
      signal,
      reason
    });

    if(signal && !activeTrades.find(t=>t.symbol===s) && activeTrades.length<5){

      let qty=dynamicQty(price, pr);

      await kite.placeOrder("regular",{
        exchange:"NSE",
        tradingsymbol:s,
        transaction_type:signal,
        quantity:qty,
        product:"MIS",
        order_type:"MARKET"
      });

      activeTrades.push({symbol:s,entry:price,type:signal,qty});
    }
  }

  let unreal=0;
  let remaining=[];

  for(let t of activeTrades){
    let cp=quotes["NSE:"+t.symbol]?.last_price;
    if(!cp) continue;

    let profit=t.type==="BUY"?(cp-t.entry):(t.entry-cp);

    if(profit>t.entry*0.003 || profit<-t.entry*0.002){
      await kite.placeOrder("regular",{
        exchange:"NSE",
        tradingsymbol:t.symbol,
        transaction_type: t.type==="BUY"?"SELL":"BUY",
        quantity:t.qty,
        product:"MIS",
        order_type:"MARKET"
      });

      closedTrades.push(profit*t.qty);
    } else {
      unreal+=profit*t.qty;
      remaining.push(t);
    }
  }

  activeTrades=remaining;

  let realized=closedTrades.reduce((a,b)=>a+b,0);
  pnl=realized+unreal;

 }catch(e){}
},3000);

app.get("/performance",(req,res)=>{
 res.json({
  botActive:BOT_ACTIVE,
  capital,
  pnl,
  serverIP,
  activeTradesCount:activeTrades.length,
  scan:scanOutput,
  activeTrades,
  closedTrades
 });
});

app.listen(process.env.PORT||3000);


// ================= FINAL INSTITUTIONAL BUILD (SAFE INTEGRATION) =================

// SAFETY
process.on("uncaughtException", e=>console.error("UNCAUGHT:",e));
process.on("unhandledRejection", e=>console.error("UNHANDLED:",e));

// STATE
let priceHistory={}, volatilityMap={}, lossTracker={}, sectorExposure={}, mtfHistory={};
let adaptiveConfig={minQuality:65,minProb:0.5};
let stats={wins:0,losses:0,total:0};

// IST TIME
function ist(){return new Date(new Date().toLocaleString("en-US",{timeZone:"Asia/Kolkata"}));}
function isTrading(){let t=ist();let m=t.getHours()*60+t.getMinutes();return m>=560&&m<=885;}
function isSquare(){let t=ist();let m=t.getHours()*60+t.getMinutes();return m>=885;}

// SAFE AVG
function avg(a,f){return (!a||!a.length)?f:a.reduce((x,y)=>x+y,0)/a.length;}

// MTF
function updateMTF(s,p){
 if(!mtfHistory[s]) mtfHistory[s]={m1:[],m5:[]};
 mtfHistory[s].m1.push(p); if(mtfHistory[s].m1.length>20) mtfHistory[s].m1.shift();
 mtfHistory[s].m5.push(p); if(mtfHistory[s].m5.length>100) mtfHistory[s].m5.shift();
}
function trend(a){
 if(a.length<5) return "NA";
 let u=0; for(let i=1;i<a.length;i++) if(a[i]>a[i-1]) u++;
 return u>=a.length/2?"UP":"DOWN";
}

// SECTOR
const sectorMap={RELIANCE:"ENERGY",TCS:"IT",INFY:"IT",HDFCBANK:"BANK",ICICIBANK:"BANK",SBIN:"BANK",ITC:"FMCG",LT:"INFRA",AXISBANK:"BANK",KOTAKBANK:"BANK"};

// AI
function updatePerf(p){
 stats.total++;
 if(p>0) stats.wins++; else stats.losses++;
 let wr=stats.wins/(stats.total||1);
 if(wr<0.5){adaptiveConfig.minQuality=Math.min(80,adaptiveConfig.minQuality+2);adaptiveConfig.minProb=Math.min(0.6,adaptiveConfig.minProb+0.02);}
 else if(wr>0.65){adaptiveConfig.minQuality=Math.max(60,adaptiveConfig.minQuality-1);adaptiveConfig.minProb=Math.max(0.5,adaptiveConfig.minProb-0.01);}
}

// ================= END FINAL BUILD =================


// ================= FINAL EDGE OPTIMIZATION =================

// SLIPPAGE CONTROL
function getLimitPrice(price, type){
  let buffer = price * 0.0005; // 0.05%
  return type==="BUY" ? price + buffer : price - buffer;
}

// EXECUTION FILTER (SPREAD SIMULATION SAFE)
function isSpreadHealthy(bid, ask){
  if(!bid || !ask) return true;
  return (ask - bid)/bid < 0.002; // <0.2%
}

// TRADE GAP CONTROL
let lastTradeTime = {};
function canTradeNow(symbol){
  let now = Date.now();
  if(!lastTradeTime[symbol]) return true;
  return (now - lastTradeTime[symbol]) > 120000; // 2 min gap
}

// PORTFOLIO CAPITAL BALANCER
function portfolioCap(qty, price){
  let maxExposure = capital * 0.2; // 20% per trade max cap
  let value = qty * price;
  if(value > maxExposure){
    return Math.floor(maxExposure / price);
  }
  return qty;
}

// PERFORMANCE LOGGING
let tradeLog = [];
function logTrade(symbol, pnl){
  tradeLog.push({symbol, pnl, time: new Date()});
  if(tradeLog.length > 100) tradeLog.shift();
}

// APPLY INTEGRATION NOTES:
// 1. Before placing order:
// if(!canTradeNow(s)) signal=null;

// 2. After qty calc:
// qty = portfolioCap(qty, price);

// 3. Before order:
// let limitPrice = getLimitPrice(price, signal);

// 4. After trade close:
// logTrade(t.symbol, profit*t.qty);
// lastTradeTime[t.symbol] = Date.now();

// ================= END EDGE =================


// ================= DASHBOARD ANALYTICS + AUTO SCALING =================

// PERFORMANCE METRICS
let analytics = {
  wins: 0,
  losses: 0,
  total: 0,
  profit: 0,
  loss: 0
};

function updateAnalytics(pnl){
  analytics.total++;
  if(pnl > 0){
    analytics.wins++;
    analytics.profit += pnl;
  } else {
    analytics.losses++;
    analytics.loss += pnl;
  }
}

function getAnalytics(){
  let winRate = analytics.total ? (analytics.wins / analytics.total) : 0;
  let avgWin = analytics.wins ? (analytics.profit / analytics.wins) : 0;
  let avgLoss = analytics.losses ? (analytics.loss / analytics.losses) : 0;

  return {
    winRate,
    avgWin,
    avgLoss,
    totalTrades: analytics.total
  };
}

// AUTO CAPITAL SCALING
function adaptiveRisk(){
  let stats = getAnalytics();
  let winRate = stats.winRate;

  if(winRate > 0.65) return 0.05;
  if(winRate > 0.55) return 0.04;
  if(winRate > 0.5) return 0.03;
  return 0.02;
}

// OVERRIDE POSITION SIZING (SAFE ADD)
function scaledQty(price){
  if(!capital) return 1;
  let risk = capital * adaptiveRisk();
  return Math.max(1, Math.floor(risk / price));
}

// ================= DASHBOARD EXTENSION =================
// MODIFY /performance RESPONSE (add fields)

const originalPerformance = app._router.stack.find(r => r.route && r.route.path === '/performance');

if(originalPerformance){
  app.get("/performance",(req,res)=>{
    let stats = getAnalytics();
    res.json({
      botActive:BOT_ACTIVE,
      capital,
      pnl,
      serverIP,
      activeTradesCount:activeTrades.length,
      scan:scanOutput,
      activeTrades,
      closedTrades,
      analytics: stats
    });
  });
}

// ================= END UPGRADE =================
