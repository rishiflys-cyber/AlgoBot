
const express = require("express");
const fs = require("fs");
const { KiteConnect } = require("kiteconnect");

const app = express();
const PORT = process.env.PORT || 3000;

const kc = new KiteConnect({ api_key: process.env.API_KEY });

/* LOGIN */
app.get("/login",(req,res)=>res.redirect(kc.getLoginURL()));

app.get("/redirect", async (req,res)=>{
  const session = await kc.generateSession(
    req.query.request_token,
    process.env.API_SECRET
  );

  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  res.send("ACCESS_TOKEN: "+session.access_token+"<br>IP: "+ip);
});

/* CORE */
let capital = 8560;
let trades = [];
let closedTrades = [];

/* REAL DATA FUNCTION */
async function getMarketData(){
  kc.setAccessToken(process.env.ACCESS_TOKEN);

  const quote = await kc.getQuote(["NSE:INFY"]);
  const price = quote["NSE:INFY"].last_price;

  return {
    price,
    rsi: Math.random()*100, // replace later with real RSI calc
    trend: Math.random()>0.5?"UP":"DOWN",
    momentum: Math.random()*2-1
  };
}

/* AI */
function aiDecision(m){
  let score = 0;
  if(m.trend==="UP") score+=30;
  if(m.rsi<40) score+=30;
  if(m.momentum>0) score+=20;

  return { action: score>=60?"BUY":"HOLD", confidence: score };
}

/* LOOP */
setInterval(async ()=>{
  try{
    let m = await getMarketData();
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
  }catch(e){
    console.log(e.message);
  }

},5000);

/* ROUTE */
app.get("/performance",(req,res)=>{
  res.json({capital,trades,closedTrades,mode:"V113_REAL_DATA"});
});

app.listen(PORT,()=>console.log("V113 RUNNING"));
