
const express = require("express");
const fs = require("fs");
const { KiteConnect } = require("kiteconnect");

const app = express();
const PORT = process.env.PORT || 3000;

const kc = new KiteConnect({ api_key: process.env.API_KEY });

/* ===== FIXED CORE ROUTES (NEVER REMOVE AGAIN) ===== */

app.get("/login",(req,res)=>{
  try{
    res.redirect(kc.getLoginURL());
  }catch(e){
    res.send("Login error: " + e.message);
  }
});

app.get("/redirect", async (req,res)=>{
  try{
    const session = await kc.generateSession(
      req.query.request_token,
      process.env.API_SECRET
    );

    const ip =
      req.headers['x-forwarded-for'] ||
      req.socket.remoteAddress ||
      "IP_NOT_FOUND";

    res.send("ACCESS_TOKEN: " + session.access_token + "<br>IP: " + ip);

  }catch(e){
    res.send("Redirect error: " + e.message);
  }
});

/* ===== CORE ENGINE ===== */

let capital = 8560;
let trades = [];
let closedTrades = [];

/* ===== PERFORMANCE ENGINE ===== */

function getStats(){
  let total = closedTrades.length;
  let wins = closedTrades.filter(t=>t.pnl>0).length;
  let losses = closedTrades.filter(t=>t.pnl<=0).length;

  let winRate = total ? (wins/total)*100 : 0;

  let totalPnL = closedTrades.reduce((a,b)=>a+b.pnl,0);

  return {
    totalTrades: total,
    wins,
    losses,
    winRate: winRate.toFixed(2) + "%",
    totalPnL: totalPnL.toFixed(2)
  };
}

function suggest(){
  let stats = getStats();
  let suggestions = [];

  if(parseFloat(stats.winRate) < 50){
    suggestions.push("Improve entry filter");
  }

  if(stats.totalTrades < 5){
    suggestions.push("Increase trade frequency");
  }

  if(suggestions.length === 0){
    suggestions.push("Strategy stable");
  }

  return suggestions;
}

/* ===== SAFE PERFORMANCE ROUTE ===== */

app.get("/performance",(req,res)=>{
  res.json({
    capital,
    trades,
    closedTrades,
    stats: getStats(),
    suggestions: suggest(),
    mode: "V117_FIXED"
  });
});

/* ROOT */
app.get("/",(req,res)=>{
  res.send("AlgoBot running (V117 FIXED)");
});

app.listen(PORT,()=>console.log("RUNNING FIXED"));