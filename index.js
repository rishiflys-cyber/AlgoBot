
const express = require("express");
const { KiteConnect } = require("kiteconnect");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static("public"));

let capital = 8491.8;
let closedTrades = [];

/* SAMPLE DATA (replace with real later) */
setInterval(()=>{
  let pnl = Math.random() > 0.5 ? 100 : -80;
  closedTrades.push({ pnl, time: new Date() });
  capital += pnl;
},15000);

function getStats(){
  let wins = closedTrades.filter(t=>t.pnl>0).length;
  let losses = closedTrades.filter(t=>t.pnl<=0).length;
  let total = closedTrades.length;
  let winRate = total ? (wins/total)*100 : 0;
  let totalPnL = closedTrades.reduce((a,b)=>a+b.pnl,0);

  return { total, wins, losses, winRate, totalPnL };
}

app.get("/api/data",(req,res)=>{
  res.json({
    capital,
    trades: closedTrades,
    stats: getStats()
  });
});

app.listen(PORT,()=>console.log("V108 DASHBOARD RUNNING"));
