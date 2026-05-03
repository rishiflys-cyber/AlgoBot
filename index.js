
const express = require("express");
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static("public"));

let capital = 8491.8;
let trades = [{
  symbol:"INFY",
  entry:127,
  sl:123,
  target:133,
  status:"LIVE"
}];

let closedTrades = [];

setInterval(()=>{
  if(trades.length){
    let t = trades[0];
    let price = t.entry + (Math.random()*10 - 5);

    t.pnl = (price - t.entry);

    if(price >= t.target || price <= t.sl){
      t.status="CLOSED";
      t.exit = price;
      capital += t.pnl;
      closedTrades.push(t);
      trades=[];
    }
  }
},5000);

app.get("/performance",(req,res)=>{
  res.json({ capital, trades, closedTrades, mode:"V110_PRO" });
});

app.get("/api/live",(req,res)=>{
  res.json({ trades });
});

app.get("/api/history",(req,res)=>{
  res.json({ closedTrades });
});

app.listen(PORT,()=>console.log("V110 PRO RUNNING"));
