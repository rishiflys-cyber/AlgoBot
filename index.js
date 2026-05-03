
const express = require("express");
const { KiteConnect } = require("kiteconnect");

const app = express();
const PORT = process.env.PORT || 3000;

const kc = new KiteConnect({ api_key: process.env.API_KEY });

app.use(express.static("public"));

/* FIXED LOGIN */
app.get("/login",(req,res)=>{
  try{
    const url = kc.getLoginURL();
    res.redirect(url);
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

/* DASHBOARD DATA */
let capital = 8491.8;
let closedTrades = [];

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

app.get("/",(req,res)=>{
  res.sendFile(__dirname + "/public/index.html");
});

app.listen(PORT,()=>console.log("V108 FIXED RUNNING"));
