
const express = require("express");
const fs = require("fs");

const app = express();
const PORT = process.env.PORT || 3000;

/* CORE STATE */
let capital = 8551.34;
let trades = [];
let closedTrades = [];

/* 🧠 AI DECISION ENGINE */
function aiDecisionEngine(market){

  let decision = {
    action: "HOLD",
    confidence: 0
  };

  // Trend detection
  if(market.trend === "UP") decision.confidence += 30;
  if(market.trend === "DOWN") decision.confidence += 30;

  // RSI logic
  if(market.rsi < 40) decision.confidence += 30;
  if(market.rsi > 60) decision.confidence += 30;

  // Momentum
  if(market.momentum > 0) decision.confidence += 20;

  // Final decision
  if(decision.confidence >= 60){
    decision.action = market.trend === "UP" ? "BUY" : "SELL";
  }

  return decision;
}

/* MARKET SIMULATION */
function getMarket(){
  return {
    price: 100 + Math.random()*20,
    rsi: Math.random()*100,
    trend: Math.random() > 0.5 ? "UP":"DOWN",
    momentum: Math.random()*2 - 1
  };
}

/* ENGINE LOOP */
setInterval(()=>{

  let market = getMarket();
  let ai = aiDecisionEngine(market);

  if(trades.length === 0 && ai.action === "BUY"){

    let t = {
      symbol:"INFY",
      entry:market.price,
      sl:market.price*0.97,
      target:market.price*1.05,
      status:"LIVE",
      aiConfidence: ai.confidence
    };

    trades.push(t);
    console.log("AI BUY", t);

  } else if(trades.length){

    let t = trades[0];
    let price = market.price;
    let pnl = price - t.entry;

    if(price >= t.target || price <= t.sl){

      t.status = "CLOSED";
      t.exit = price;
      t.pnl = pnl;

      capital += pnl;
      closedTrades.push(t);

      fs.appendFileSync("trades.log", JSON.stringify(t)+"\n");

      console.log("AI EXIT", t);

      trades = [];
    }
  }

},5000);

/* ROUTES */
app.get("/performance",(req,res)=>{
  res.json({
    capital,
    trades,
    closedTrades,
    mode:"V112_AI_ENGINE"
  });
});

app.listen(PORT,()=>console.log("V112 AI ENGINE RUNNING"));
