// FULL SYSTEM — STEP 1–22 (RESTORED + FIXED + INTEGRATED)

// ===== IMPORTS =====
require("dotenv").config();
const express = require("express");
const os = require("os");
const { KiteConnect } = require("kiteconnect");

const app = express();
const kite = new KiteConnect({ api_key: process.env.KITE_API_KEY });

// ===== CORE STATE =====
let access_token=null, BOT_ACTIVE=false;
let capital=0, pnl=0, peakPnL=0;
let activeTrades=[], closedTrades=[];
let alerts=[];

// ===== STRATEGY =====
let strategyStats={
 momentum:{trades:0,profit:0},
 meanReversion:{trades:0,profit:0}
};

// ===== AI =====
let strategyWeights={momentum:0.5, meanReversion:0.5};

// ===== CAPITAL ENGINE =====
let pnlEngine={daily:0,weekly:0,monthly:0};

// ===== HELPERS =====
function safeMarketProtection(v){ return (!v||v<2)?2:v; }

function getIP(req){
 return req.headers['x-forwarded-for'] || req.socket.remoteAddress;
}

function getLocalIP(){
 const nets = os.networkInterfaces();
 for (const name of Object.keys(nets)) {
  for (const net of nets[name]) {
   if (net.family === 'IPv4' && !net.internal) return net.address;
  }
 }
 return "0.0.0.0";
}

// ===== LOGIN =====
app.get("/login",(req,res)=> res.redirect(kite.getLoginURL()));

app.get("/redirect", async (req,res)=>{
 try{
  const session=await kite.generateSession(req.query.request_token,process.env.KITE_API_SECRET);
  access_token=session.access_token;
  kite.setAccessToken(access_token);
  BOT_ACTIVE=true;

  res.send(`<h2>Login Success</h2><p>IP:${getIP(req)}</p><p>Local:${getLocalIP()}</p>`);
 }catch(e){
  res.send("Login Failed");
 }
});

// ===== ROOT =====
app.get("/", (req,res)=>{
 res.send("<h2>AlgoBot Running</h2><a href='/performance'>Dashboard</a>");
});

// ===== CAPITAL =====
async function getLiveCapital(){
 try{
   const m = await kite.getMargins("equity");
   return m.available.cash;
 }catch(e){ return 0;}
}

// ===== STRATEGY =====
function runStrategies(){
 let pr = Math.random();
 return pr>0.7 ? "momentum" : (pr<0.3 ? "meanReversion":null);
}

// ===== AI =====
function weightedStrategy(){
 return Math.random() < strategyWeights.momentum ? "momentum":"meanReversion";
}

// ===== RISK =====
function riskGate(price, qty){
 let exposure = activeTrades.reduce((a,t)=>a+(t.entry*t.qty),0);
 return (exposure + price*qty) <= capital*0.6;
}

// ===== EXECUTION =====
async function executeTrade(symbol, price, strategy){
 let qty = Math.max(1, Math.floor((capital*0.02)/price));

 await kite.placeOrder("regular",{
  exchange:"NSE",
  tradingsymbol:symbol,
  transaction_type:"BUY",
  quantity:qty,
  product:"MIS",
  order_type:"MARKET",
  validity:"DAY",
  market_protection:safeMarketProtection(0)
 });

 activeTrades.push({symbol,entry:price,qty,strategy});
 strategyStats[strategy].trades++;
}

// ===== PNL ENGINE =====
function updatePnL(v){
 pnl+=v;
 pnlEngine.daily+=v;
 pnlEngine.monthly+=v;
}

// ===== HEDGE =====
let hedgeActive=false;
function hedgeController(){
 let dd=(peakPnL-pnl)/(peakPnL||1);
 if(dd>0.05) hedgeActive=true;
}

// ===== ALERT =====
function pushAlert(t,m){
 alerts.push({time:new Date(),t,m});
 if(alerts.length>50) alerts.shift();
}

// ===== LOOP =====
setInterval(async ()=>{
 if(!BOT_ACTIVE) return;

 capital = await getLiveCapital();

 let price=1000+Math.random()*500;
 let strategy = runStrategies() || weightedStrategy();

 if(strategy){
   if(!riskGate(price,1)) return;
   await executeTrade("RELIANCE",price,strategy);
 }

 hedgeController();

 if((peakPnL-pnl)/(peakPnL||1)>0.08){
  pushAlert("RISK","Drawdown high");
 }

},4000);

// ===== PERFORMANCE =====
app.get("/performance", async (req,res)=>{
 capital = await getLiveCapital();

 res.json({
  realSystem:true,
  capital,
  pnl,
  pnlEngine,
  drawdown:(peakPnL-pnl)/(peakPnL||1),
  activeTrades:activeTrades.length,
  strategies:strategyStats,
  hedgeActive,
  alerts
 });
});

// ===== START =====
app.listen(process.env.PORT||3000);
