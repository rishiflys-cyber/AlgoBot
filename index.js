
const express = require("express");
const fs = require("fs");
const { KiteConnect } = require("kiteconnect");

const app = express();
const PORT = process.env.PORT || 3000;

const kc = new KiteConnect({ api_key: process.env.API_KEY });

app.use(express.static("public"));

/* LOGIN FIX */
app.get("/login",(req,res)=>{
  try{
    res.redirect(kc.getLoginURL());
  }catch(e){
    res.send("Login error: "+e.message);
  }
});

app.get("/redirect", async (req,res)=>{
  try{
    const session = await kc.generateSession(
      req.query.request_token,
      process.env.API_SECRET
    );

    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || "IP_NOT_FOUND";

    res.send("ACCESS_TOKEN: "+session.access_token+"<br>IP: "+ip);
  }catch(e){
    res.send("Redirect error: "+e.message);
  }
});

/* CORE */
let capital = 8491.8;
let trades = [];
let closedTrades = [];

/* LOGGING */
function logTrade(trade){
  const line = JSON.stringify(trade) + "\n";
  fs.appendFileSync("trades.log", line);
}

/* ALERT (console for now) */
function sendAlert(msg){
  console.log("ALERT:", msg);
}

/* SIM ENGINE */
setInterval(()=>{
  let price = 100 + Math.random()*20;

  if(trades.length === 0){
    let t = {
      symbol:"INFY",
      entry:price,
      sl:price*0.97,
      target:price*1.05,
      status:"LIVE"
    };
    trades.push(t);
    sendAlert("BUY "+t.symbol+" @ "+t.entry);
  }else{
    let t = trades[0];

    let pnl = price - t.entry;

    if(price >= t.target || price <= t.sl){
      t.status="CLOSED";
      t.exit = price;
      t.pnl = pnl;

      capital += pnl;
      closedTrades.push(t);

      logTrade(t);
      sendAlert("EXIT "+t.symbol+" PnL: "+pnl);

      trades=[];
    }
  }
},8000);

/* ROUTES */
app.get("/performance",(req,res)=>{
  res.json({capital, trades, closedTrades, mode:"V111_ALERT_LOG"});
});

app.get("/logs",(req,res)=>{
  try{
    const data = fs.readFileSync("trades.log","utf8");
    res.send(data);
  }catch{
    res.send("No logs yet");
  }
});

app.listen(PORT,()=>console.log("V111 RUNNING"));
