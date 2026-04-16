
require("dotenv").config();
const express = require("express");
const path = require("path");
const { KiteConnect } = require("kiteconnect");

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const kite = new KiteConnect({ api_key: process.env.KITE_API_KEY });

let access_token=null, BOT_ACTIVE=false;
let tradesToday=0, position=null, entryPrice=0;
let pnl=0, capital=0;

let tradeLog = [];

const STOCKS = ["RELIANCE","HDFCBANK","ICICIBANK","INFY","TCS"];

const CONFIG = {
  MAX_TRADES:2,
  SL:0.01,
  TP:0.02
};

// LOGIN
app.get("/login",(req,res)=>res.redirect(kite.getLoginURL()));

app.get("/redirect", async (req,res)=>{
 try{
  const s=await kite.generateSession(req.query.request_token, process.env.KITE_API_SECRET);
  access_token=s.access_token;
  kite.setAccessToken(access_token);
  res.send("Login Success");
 }catch{res.send("Login Failed")}
});

// CONTROL
app.get("/start",(req,res)=>{BOT_ACTIVE=true;res.send("STARTED")});
app.get("/kill",(req,res)=>{BOT_ACTIVE=false;res.send("STOPPED")});

// DASHBOARD
app.get("/dashboard", async (req,res)=>{
 try{
  if(access_token){
    const m=await kite.getMargins();
    capital=m?.equity?.net||0;
  }
 }catch{}
 res.json({capital,BOT_ACTIVE,position,tradesToday,pnl});
});

// PERFORMANCE METRICS
app.get("/performance",(req,res)=>{
 let wins = tradeLog.filter(t=>t.pnl>0).length;
 let losses = tradeLog.filter(t=>t.pnl<0).length;
 let total = tradeLog.length;

 let avgWin = wins ? tradeLog.filter(t=>t.pnl>0).reduce((a,b)=>a+b.pnl,0)/wins : 0;
 let avgLoss = losses ? Math.abs(tradeLog.filter(t=>t.pnl<0).reduce((a,b)=>a+b.pnl,0)/losses) : 0;

 let winRate = total ? (wins/total)*100 : 0;
 let rr = avgLoss ? avgWin/avgLoss : 0;
 let expectancy = (winRate/100)*avgWin - (1-winRate/100)*avgLoss;

 res.json({total,wins,losses,winRate,avgWin,avgLoss,rr,expectancy});
});

// MOCK TRADE LOG (for now)
function logTrade(pnlValue){
 tradeLog.push({pnl:pnlValue});
}

// LOOP (simulated trades)
setInterval(()=>{
 if(!BOT_ACTIVE) return;
 if(tradesToday>=CONFIG.MAX_TRADES) return;

 let randomPnL = Math.random()>0.5 ? 100 : -80;
 pnl += randomPnL;
 logTrade(randomPnL);

 tradesToday++;
},5000);

// RESET
setInterval(()=>{tradesToday=0},86400000);

// PORT
const PORT=process.env.PORT||3000;
app.listen(PORT,()=>console.log("BOT WITH PERFORMANCE TRACKER RUNNING"));
