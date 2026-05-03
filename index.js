
const express = require("express");
const { KiteConnect } = require("kiteconnect");

const app = express();
const PORT = process.env.PORT || 3000;

const kc = new KiteConnect({ api_key: process.env.API_KEY });

/* LOGIN */
app.get("/login",(req,res)=>res.redirect(kc.getLoginURL()));
app.get("/redirect", async (req,res)=>{
  const session = await kc.generateSession(req.query.request_token, process.env.API_SECRET);
  res.send("ACCESS_TOKEN: " + session.access_token);
});

/* CORE DATA */
let capital = 8491.8;
let trades = [];
let closedTrades = [];

/* ANALYTICS */
function getStats(){
  let wins = closedTrades.filter(t=>t.pnl>0).length;
  let losses = closedTrades.filter(t=>t.pnl<=0).length;

  let total = closedTrades.length;
  let winRate = total ? (wins/total)*100 : 0;

  let totalPnL = closedTrades.reduce((a,b)=>a+b.pnl,0);

  return {
    totalTrades: total,
    wins,
    losses,
    winRate: winRate.toFixed(2)+"%",
    totalPnL
  };
}

/* SAMPLE TRADE SIMULATION (for analytics testing) */
function simulateTrade(){
  let pnl = Math.random() > 0.5 ? 100 : -80;

  let trade = {
    symbol:"SIM",
    entry:100,
    exit:100 + pnl,
    pnl,
    time: new Date().toISOString()
  };

  closedTrades.push(trade);
  capital += pnl;
}

setInterval(simulateTrade,15000);

/* ROUTES */

app.get("/performance",(req,res)=>{
  res.json({
    capital,
    trades,
    closedTrades,
    mode:"V107_ANALYTICS"
  });
});

app.get("/analytics",(req,res)=>{
  res.json(getStats());
});

app.get("/",(req,res)=>{
  res.send("V107 ANALYTICS RUNNING");
});

app.listen(PORT,()=>console.log("V107 RUNNING"));
