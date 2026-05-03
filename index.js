
const express = require("express");
const fs = require("fs");

const app = express();
const PORT = process.env.PORT || 3000;

/* CORE */
let capital = 8560;
let trades = [];
let closedTrades = [];

/* PERFORMANCE ENGINE */
function getStats(){

  let total = closedTrades.length;
  let wins = closedTrades.filter(t=>t.pnl>0).length;
  let losses = closedTrades.filter(t=>t.pnl<=0).length;

  let winRate = total ? (wins/total)*100 : 0;

  let totalPnL = closedTrades.reduce((a,b)=>a+b.pnl,0);

  let avgWin = wins ? closedTrades.filter(t=>t.pnl>0)
                  .reduce((a,b)=>a+b.pnl,0)/wins : 0;

  let avgLoss = losses ? closedTrades.filter(t=>t.pnl<=0)
                  .reduce((a,b)=>a+b.pnl,0)/losses : 0;

  return {
    totalTrades: total,
    wins,
    losses,
    winRate: winRate.toFixed(2)+"%",
    totalPnL: totalPnL.toFixed(2),
    avgWin: avgWin.toFixed(2),
    avgLoss: avgLoss.toFixed(2)
  };
}

/* SIMPLE AUTO OPTIMIZER */
function suggest(){

  let stats = getStats();

  let suggestion = [];

  if(parseFloat(stats.winRate) < 50){
    suggestion.push("👉 Improve entry filter (increase confidence threshold)");
  }

  if(parseFloat(stats.avgLoss) < -parseFloat(stats.avgWin)){
    suggestion.push("👉 Tighten SL or improve RR ratio");
  }

  if(stats.totalTrades < 5){
    suggestion.push("👉 Increase trade frequency (lower score threshold)");
  }

  if(suggestion.length === 0){
    suggestion.push("✅ Strategy looks stable");
  }

  return suggestion;
}

/* SIMULATION FOR TEST */
setInterval(()=>{
  let pnl = Math.random()>0.5 ? 120 : -80;

  let trade = {
    symbol:"TEST",
    pnl
  };

  closedTrades.push(trade);
  capital += pnl;

},15000);

/* ROUTES */
app.get("/performance",(req,res)=>{
  res.json({
    capital,
    trades,
    closedTrades,
    stats: getStats(),
    suggestions: suggest(),
    mode:"V117_PERFORMANCE_TUNER"
  });
});

app.listen(PORT,()=>console.log("V117 RUNNING"));
