
const express = require("express");
const { KiteConnect } = require("kiteconnect");

const app = express();
const PORT = process.env.PORT || 3000;

const kc = new KiteConnect({ api_key: process.env.API_KEY });

app.use(express.static("public"));

/* LOGIN */
app.get("/login",(req,res)=>res.redirect(kc.getLoginURL()));

app.get("/redirect", async (req,res)=>{
  const session = await kc.generateSession(req.query.request_token, process.env.API_SECRET);
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || "IP_NOT_FOUND";
  res.send("ACCESS_TOKEN: " + session.access_token + "<br>IP: " + ip);
});

/* DATA */
let capital = 8491.8;
let trades = [];
let closedTrades = [];

/* SIMULATION (replace later with real engine) */
setInterval(()=>{
  let price = Math.random()*1000;

  if(trades.length === 0){
    trades.push({
      symbol:"INFY",
      entry:price,
      sl:price*0.97,
      target:price*1.05,
      status:"LIVE"
    });
  } else {
    let t = trades[0];
    if(Math.random() > 0.5){
      let pnl = 100;
      capital += pnl;
      t.status="CLOSED";
      t.exit = t.entry + pnl;
      t.pnl = pnl;
      closedTrades.push(t);
      trades = [];
    }
  }
},15000);

/* ROUTES */

app.get("/performance",(req,res)=>{
  res.json({ capital, trades, closedTrades, mode:"V109_TERMINAL" });
});

app.get("/api/live",(req,res)=>{
  res.json({ trades });
});

app.get("/api/history",(req,res)=>{
  res.json({ closedTrades });
});

app.listen(PORT,()=>console.log("V109 TERMINAL RUNNING"));
