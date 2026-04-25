
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


// ================= SAFE TOP-3 + COMPLIANCE MODE + MARKET PROTECTION FIX =================

// -------- COMPLIANCE MODE --------
let AUTO_TRADING = false; // set true ONLY if allowed

// -------- MARKET PROTECTION FIX --------
// Zerodha rejects 0, so enforce minimum
function safeMarketProtection(mp){
  if(mp === undefined || mp <= 0) return 2; // minimum safe value
  return mp;
}

// -------- TRADE REJECTION ENGINE --------
function rejectTrade(s, price, history, volumeHistory, priceHistory){
  try{
    let priceChange = history[s]?.length > 1 
      ? Math.abs(price - history[s][history[s].length - 2]) / price 
      : 0;

    let priceMovedTooFast = priceChange > 0.003;

    let volArr = volumeHistory[s] || [];
    let volSpike = volArr.length > 2 && volArr[volArr.length-1] > (2 * volArr[volArr.length - 2]);

    let unstableMove = priceHistory[s] && priceHistory[s].length > 3 &&
      Math.abs(price - priceHistory[s][priceHistory[s].length - 3]) / price > 0.004;

    return priceMovedTooFast || volSpike || unstableMove;
  }catch(e){
    return true;
  }
}

// -------- ENTRY PRECISION --------
function entryCheck(signal, price, history, s){
  let prevPrice = history[s]?.[history[s].length - 2];

  if(signal === "BUY" && prevPrice && price < prevPrice) return false;
  if(signal === "SELL" && prevPrice && price > prevPrice) return false;

  return true;
}

// -------- DRAWDOWN ADAPTATION --------
let peakCapital = 0;

function getDrawdown(capital){
  if(capital > peakCapital) peakCapital = capital;
  return peakCapital > 0 ? (peakCapital - capital) / peakCapital : 0;
}

function adjustedRisk(baseRisk, capital){
  let dd = getDrawdown(capital);

  if(dd > 0.02) return baseRisk * 0.5;
  if(dd > 0.01) return baseRisk * 0.75;

  return baseRisk;
}

// ================= INTEGRATION NOTES =================
// 1. BEFORE placing trade:
// if(rejectTrade(s, price, history, volumeHistory, priceHistory)) signal=null;

// 2. ENTRY FILTER:
// if(!entryCheck(signal, price, history, s)) signal=null;

// 3. POSITION SIZING:
// let risk = adjustedRisk(pr >=0.6 ? 0.05 : 0.02, capital);

// 4. COMPLIANCE:
// if(!AUTO_TRADING) signal=null;

// 5. ORDER:
// market_protection: safeMarketProtection(0)

// ================= END PATCH =================


// ================= EQUITY CURVE + DRAWDOWN DASHBOARD =================

// EQUITY TRACKING
let equityHistory = [];
let maxEquity = 0;
let maxDrawdown = 0;

function updateEquity(pnl){
  let currentEquity = capital + pnl;

  equityHistory.push({
    time: new Date(),
    equity: currentEquity
  });

  if(equityHistory.length > 500) equityHistory.shift();

  // Track peak
  if(currentEquity > maxEquity) maxEquity = currentEquity;

  // Drawdown calc
  let dd = maxEquity > 0 ? (maxEquity - currentEquity) / maxEquity : 0;
  if(dd > maxDrawdown) maxDrawdown = dd;

  return {currentEquity, dd};
}

// DASHBOARD EXTENSION (SAFE ADD)
const originalPerfRoute = app._router.stack.find(r => r.route && r.route.path === '/performance');

if(originalPerfRoute){
  app.get("/performance",(req,res)=>{
    let analyticsData = (typeof getAnalytics === "function") ? getAnalytics() : {};

    let eq = updateEquity(pnl);

    res.json({
      botActive: BOT_ACTIVE,
      capital,
      pnl,
      serverIP,
      activeTradesCount: activeTrades.length,
      scan: scanOutput,
      activeTrades,
      closedTrades,

      // NEW DASHBOARD DATA
      analytics: analyticsData,
      equity: eq.currentEquity,
      drawdown: eq.dd,
      maxDrawdown,
      equityHistory
    });
  });
}

// ================= END DASHBOARD =================


// ================= EQUITY GRAPH UI + DRAWDOWN ALERT =================

// ALERT THRESHOLD
const DRAWDOWN_ALERT = 0.03; // 3%

let alertTriggered = false;

// MODIFY DASHBOARD UI (replace "/" route HTML)
app.get("/",(req,res)=>{
 res.send(`
 <h2>FINAL MULTI-STRATEGY SYSTEM</h2>
 <button onclick="location.href='/login'">Login</button>
 <button onclick="fetch('/start')">Start</button>
 <button onclick="fetch('/kill')">Kill</button>

 <canvas id="equityChart" width="800" height="300"></canvas>
 <pre id="data"></pre>

 <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>

 <script>
 let chart;

 async function loadData(){
  let r = await fetch('/performance');
  let d = await r.json();

  document.getElementById('data').innerText = JSON.stringify(d,null,2);

  let labels = d.equityHistory.map(x=> new Date(x.time).toLocaleTimeString());
  let values = d.equityHistory.map(x=> x.equity);

  if(!chart){
    const ctx = document.getElementById('equityChart').getContext('2d');
    chart = new Chart(ctx,{
      type:'line',
      data:{
        labels:labels,
        datasets:[{
          label:'Equity Curve',
          data:values,
          fill:false,
          tension:0.1
        }]
      }
    });
  } else {
    chart.data.labels = labels;
    chart.data.datasets[0].data = values;
    chart.update();
  }
 }

 setInterval(loadData,2000);
 </script>
 `);
});

// DRAWDOWN ALERT (SERVER SIDE)
function checkDrawdownAlert(drawdown){
  if(drawdown > DRAWDOWN_ALERT && !alertTriggered){
    console.log("⚠️ ALERT: Drawdown breached", drawdown);
    alertTriggered = true;
  }
  if(drawdown < DRAWDOWN_ALERT){
    alertTriggered = false;
  }
}

// INTEGRATION NOTE:
// call checkDrawdownAlert(eq.dd) inside performance update

// ================= END UI + ALERT =================


// ================= AUTO DISABLE + RECOVERY MODE =================

// CONFIG
const DD_HARD_STOP = 0.03;   // 3% stop trading
const DD_RECOVERY = 0.015;   // resume below 1.5%

let tradingDisabled = false;

// MODIFY drawdown check
function enhancedDrawdownControl(drawdown){
  if(drawdown >= DD_HARD_STOP){
    tradingDisabled = true;
    console.log("🛑 TRADING DISABLED (Drawdown breach):", drawdown);
  }

  if(tradingDisabled && drawdown <= DD_RECOVERY){
    tradingDisabled = false;
    console.log("✅ RECOVERY MODE COMPLETE - Trading Resumed:", drawdown);
  }
}

// INTEGRATION:
// 1. After equity calculation:
// enhancedDrawdownControl(eq.dd);

// 2. Before placing trade:
// if(tradingDisabled) signal = null;

// ================= END AUTO CONTROL =================


// ================= SHADOW SIMULATOR (SAFE, NON-INTERFERING) =================

// Shadow state (completely separate)
let shadowTrades = [];
let shadowClosed = [];
let shadowPnL = 0;

// Simulate entry (NO real order)
function shadowEnter(symbol, price, type, qty){
  shadowTrades.push({
    symbol,
    entry: price,
    type,
    qty
  });
}

// Simulate exit
function shadowExit(trade, price){
  let profit = trade.type==="BUY" ? (price - trade.entry) : (trade.entry - price);
  let pnl = profit * trade.qty;

  shadowClosed.push(pnl);
  shadowPnL += pnl;
}

// Hook: AFTER signal generation (NON-BLOCKING)
function shadowProcessSignal(symbol, price, signal, qty){
  if(!signal) return;

  // prevent duplicate shadow trades
  if(shadowTrades.find(t=>t.symbol===symbol)) return;

  shadowEnter(symbol, price, signal, qty);
}

// Hook: INSIDE activeTrades loop (mirror exit logic safely)
function shadowMonitorExit(quotes){
  let remaining = [];

  for(let t of shadowTrades){
    let cp = quotes["NSE:"+t.symbol]?.last_price;
    if(!cp){
      remaining.push(t);
      continue;
    }

    let profit = t.type==="BUY" ? (cp - t.entry) : (t.entry - cp);

    // same SL/TP logic (approx mirror)
    if(profit > t.entry*0.003 || profit < -t.entry*0.002){
      shadowExit(t, cp);
    } else {
      remaining.push(t);
    }
  }

  shadowTrades = remaining;
}

// Extend dashboard safely
const existingPerf = app._router.stack.find(r => r.route && r.route.path === '/performance');

if(existingPerf){
  app.get("/performance",(req,res)=>{
    res.json({
      botActive:BOT_ACTIVE,
      capital,
      pnl,
      serverIP,
      activeTradesCount:activeTrades.length,
      scan:scanOutput,
      activeTrades,
      closedTrades,

      // SHADOW DATA
      shadowPnL,
      shadowActive: shadowTrades.length,
      shadowClosed
    });
  });
}

// ================= END SHADOW =================


// ================= LIVE VS SHADOW COMPARISON + AUTO INSIGHTS =================

// INSIGHT ENGINE
let insights = {
  divergence: 0,
  betterSystem: "EQUAL",
  executionIssue: false
};

function generateInsights(){
  let real = pnl || 0;
  let shadow = shadowPnL || 0;

  insights.divergence = shadow - real;

  if(shadow > real * 1.1){
    insights.betterSystem = "SHADOW";
    insights.executionIssue = true;
  } else if(real > shadow * 1.1){
    insights.betterSystem = "LIVE";
    insights.executionIssue = false;
  } else {
    insights.betterSystem = "EQUAL";
    insights.executionIssue = false;
  }

  return insights;
}

// EXTEND DASHBOARD SAFELY
const perfRoute = app._router.stack.find(r => r.route && r.route.path === '/performance');

if(perfRoute){
  app.get("/performance",(req,res)=>{
    let insightData = generateInsights();

    res.json({
      botActive:BOT_ACTIVE,
      capital,
      pnl,
      serverIP,
      activeTradesCount:activeTrades.length,
      scan:scanOutput,
      activeTrades,
      closedTrades,

      shadowPnL,
      shadowActive: shadowTrades.length,
      shadowClosed,

      insights: insightData
    });
  });
}

// ================= END INSIGHTS =================


// ================= SAFE AUTO-OPTIMIZATION ENGINE =================

// bounded adaptive config (SAFE LIMITS)
let autoConfig = {
  minQuality: 65,
  minProb: 0.5
};

function autoOptimize(){
  try{
    let real = pnl || 0;
    let shadow = shadowPnL || 0;

    // only act if enough trades
    if(closedTrades.length < 10) return;

    // divergence logic
    let diff = shadow - real;

    // SAFE bounded adjustments
    if(diff > 0){ 
      // shadow better → loosen slightly
      autoConfig.minQuality = Math.max(60, autoConfig.minQuality - 1);
      autoConfig.minProb = Math.max(0.5, autoConfig.minProb - 0.01);
    } else if(diff < 0){
      // live better → tighten slightly
      autoConfig.minQuality = Math.min(80, autoConfig.minQuality + 1);
      autoConfig.minProb = Math.min(0.6, autoConfig.minProb + 0.01);
    }

  }catch(e){
    console.log("AutoOptimize Error:", e.message);
  }
}

// APPLY (SAFE HOOK)
// call autoOptimize() once every cycle (after pnl update)

// MODIFY SIGNAL FILTER (SAFE ADDITIVE)
// replace existing threshold checks with:
function passesAutoFilter(tradeQualityScore, pr){
  return (
    tradeQualityScore >= autoConfig.minQuality &&
    pr >= autoConfig.minProb
  );
}

// DASHBOARD ADD
const perfRoute2 = app._router.stack.find(r => r.route && r.route.path === '/performance');

if(perfRoute2){
  app.get("/performance",(req,res)=>{
    let insightData = (typeof generateInsights==="function") ? generateInsights() : {};

    res.json({
      botActive:BOT_ACTIVE,
      capital,
      pnl,
      serverIP,
      activeTradesCount:activeTrades.length,
      scan:scanOutput,
      activeTrades,
      closedTrades,
      shadowPnL,
      shadowActive: shadowTrades.length,
      shadowClosed,
      insights: insightData,
      autoConfig
    });
  });
}

// ================= END AUTO OPTIMIZATION =================


// ================= MULTI-STRATEGY PORTFOLIO ENGINE =================

// Strategy registry
let strategies = {
  momentum: true,
  meanReversion: true,
  breakout: true
};

// Strategy performance tracking
let strategyStats = {
  momentum: { pnl: 0, trades: 0 },
  meanReversion: { pnl: 0, trades: 0 },
  breakout: { pnl: 0, trades: 0 }
};

// Strategy selection
function runStrategies(s, price, history, volumeHistory){
  let signals = [];

  try{
    // Momentum (existing logic reuse)
    let pr = history[s]?.length > 3 ? (
      history[s].filter((v,i,a)=> i>0 && v>a[i-1]).length / history[s].length
    ) : 0;

    if(strategies.momentum && pr >= 0.6){
      signals.push({type:"BUY", strategy:"momentum"});
    }

    // Mean Reversion (simple)
    let avg = history[s]?.reduce((a,b)=>a+b,0)/ (history[s]?.length||1);
    if(strategies.meanReversion && avg && price < avg*0.995){
      signals.push({type:"BUY", strategy:"meanReversion"});
    }

    // Breakout
    let max = Math.max(...(history[s]||[price]));
    if(strategies.breakout && price >= max){
      signals.push({type:"BUY", strategy:"breakout"});
    }

  }catch(e){}

  return signals;
}

// Strategy weighting (based on performance)
function pickBestSignal(signals){
  if(!signals.length) return null;

  signals.sort((a,b)=>{
    let pa = strategyStats[a.strategy]?.pnl || 0;
    let pb = strategyStats[b.strategy]?.pnl || 0;
    return pb - pa;
  });

  return signals[0];
}

// Update stats
function updateStrategyStats(strategy, pnl){
  if(!strategyStats[strategy]) return;
  strategyStats[strategy].pnl += pnl;
  strategyStats[strategy].trades += 1;
}

// Dashboard extension
const perfRoute3 = app._router.stack.find(r => r.route && r.route.path === '/performance');

if(perfRoute3){
  app.get("/performance",(req,res)=>{
    res.json({
      botActive:BOT_ACTIVE,
      capital,
      pnl,
      serverIP,
      activeTradesCount:activeTrades.length,
      scan:scanOutput,
      activeTrades,
      closedTrades,
      shadowPnL,
      shadowActive: shadowTrades.length,
      shadowClosed,
      strategyStats
    });
  });
}

// ================= END MULTI-STRATEGY =================


// ================= STRATEGY ROTATION + CAPITAL ALLOCATION =================

// Strategy capital weights
let strategyAllocation = {
  momentum: 0.34,
  meanReversion: 0.33,
  breakout: 0.33
};

// Normalize weights
function normalizeAlloc(){
  let total = Object.values(strategyAllocation).reduce((a,b)=>a+b,0);
  if(total === 0) return;
  for(let k in strategyAllocation){
    strategyAllocation[k] = strategyAllocation[k] / total;
  }
}

// Rotation logic (based on performance)
function rotateCapital(){
  try{
    let totalPnL = Object.values(strategyStats).reduce((a,b)=>a + b.pnl,0);
    if(totalPnL === 0) return;

    for(let k in strategyStats){
      let perf = strategyStats[k].pnl;

      // proportional allocation (bounded)
      let weight = perf / totalPnL;

      // smooth adjustment
      strategyAllocation[k] = Math.max(0.1, Math.min(0.6, weight));
    }

    normalizeAlloc();

  }catch(e){
    console.log("Rotation error:", e.message);
  }
}

// Capital allocation per trade
function getStrategyQty(price, strategy){
  if(!capital) return 1;

  let baseRisk = adaptiveRisk ? adaptiveRisk() : 0.02;
  let alloc = strategyAllocation[strategy] || 0.33;

  let risk = capital * baseRisk * alloc;
  return Math.max(1, Math.floor(risk / price));
}

// Dashboard extension
const perfRoute4 = app._router.stack.find(r => r.route && r.route.path === '/performance');

if(perfRoute4){
  app.get("/performance",(req,res)=>{
    res.json({
      botActive:BOT_ACTIVE,
      capital,
      pnl,
      serverIP,
      activeTradesCount:activeTrades.length,
      scan:scanOutput,
      activeTrades,
      closedTrades,
      shadowPnL,
      shadowActive: shadowTrades.length,
      shadowClosed,
      strategyStats,
      strategyAllocation
    });
  });
}

// ================= END STRATEGY ROTATION =================
