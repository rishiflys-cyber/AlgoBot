
const express = require("express");
const fs = require("fs");
const { KiteConnect } = require("kiteconnect");

const app = express();
const PORT = process.env.PORT || 3000;

const kc = new KiteConnect({ api_key: process.env.API_KEY });

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

    const ip =
      req.headers['x-forwarded-for'] ||
      req.socket.remoteAddress ||
      "IP_NOT_FOUND";

    res.send("ACCESS_TOKEN: "+session.access_token+"<br>IP: "+ip);

  }catch(e){
    res.send("Redirect error: "+e.message);
  }
});

/* CORE STATE */
let capital = 8551.34;
let trades = [];
let closedTrades = [];

/* AI ENGINE */
function aiDecision(m){
  let score = 0;

  if(m.trend==="UP") score+=30;
  if(m.rsi<40) score+=30;
  if(m.momentum>0) score+=20;

  return {
    action: score>=60 ? "BUY":"HOLD",
    confidence: score
  };
}

function fakeMarket(){
  return {
    price:100+Math.random()*20,
    rsi:Math.random()*100,
    trend:Math.random()>0.5?"UP":"DOWN",
    momentum:Math.random()*2-1
  };
}

setInterval(()=>{
  let m = fakeMarket();
  let ai = aiDecision(m);

  if(!trades.length && ai.action==="BUY"){
    trades.push({
      symbol:"INFY",
      entry:m.price,
      sl:m.price*0.97,
      target:m.price*1.05,
      status:"LIVE",
      confidence:ai.confidence
    });
  } else if(trades.length){
    let t = trades[0];
    let price = m.price;
    let pnl = price - t.entry;

    if(price>=t.target || price<=t.sl){
      t.status="CLOSED";
      t.exit=price;
      t.pnl=pnl;

      capital+=pnl;
      closedTrades.push(t);

      fs.appendFileSync("trades.log", JSON.stringify(t)+"\n");

      trades=[];
    }
  }

},5000);

/* ROUTES */
app.get("/performance",(req,res)=>{
  res.json({capital, trades, closedTrades, mode:"V112_AI_FIXED"});
});

app.get("/",(req,res)=>{
  res.send("V112 AI FIXED RUNNING");
});

app.listen(PORT,()=>console.log("RUNNING"));
