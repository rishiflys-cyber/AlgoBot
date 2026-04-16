// FINAL COMPLETE SYSTEM
require("dotenv").config();
const express = require("express");
const path = require("path");
const { KiteConnect } = require("kiteconnect");

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const kite = new KiteConnect({ api_key: process.env.KITE_API_KEY });

let access_token = null;
let BOT_ACTIVE = false;
let position = null;

console.log("🚀 FINAL COMPLETE SYSTEM ACTIVE");

const STOCKS = ["RELIANCE","TCS","INFY","HDFCBANK","ICICIBANK","SBIN","LT","ITC","HINDUNILVR","AXISBANK"];
const EXCHANGE = "NSE";
const PRODUCT = "MIS";

const MAX_TRADE_VALUE = 500;
const SL = 0.02;
const TP = 0.03;

app.get("/login", (req,res)=> res.redirect(kite.getLoginURL()));

app.get("/redirect", async (req,res)=>{
  const session = await kite.generateSession(req.query.request_token, process.env.KITE_API_SECRET);
  access_token = session.access_token;
  kite.setAccessToken(access_token);
  res.send("Login Success");
});

app.get("/start",(req,res)=>{ BOT_ACTIVE=true; res.send("STARTED"); });
app.get("/kill",(req,res)=>{ BOT_ACTIVE=false; res.send("STOPPED"); });

app.get("/dashboard", async (req,res)=>{
  let capital = 0;
  try {
    const margins = await kite.getMargins();
    capital = margins?.equity?.net || 0;
  } catch {}
  res.json({capital, BOT_ACTIVE, position});
});

function ema(values, period){
  const k = 2/(period+1);
  let prev = values[0];
  return values.map(v=>{
    prev = v*k + prev*(1-k);
    return prev;
  });
}

function aiScore(prices, candles){
  let score = 0;
  const trend = Math.abs((prices.at(-1)-prices.at(-5))/prices.at(-5));
  if(trend>0.002) score+=30;
  const last = candles.at(-1);
  const body = (last.close-last.open)/last.open;
  if(Math.abs(body)>0.001) score+=30;
  const avgVol = candles.slice(-10).reduce((s,c)=>s+(c.volume||0),0)/10;
  if((last.volume||0)>avgVol) score+=20;
  if(prices.at(-1)>prices.at(-2) && prices.at(-2)>prices.at(-3)) score+=20;
  return score;
}

function getIST(){
  const now = new Date();
  return new Date(now.toLocaleString("en-US",{timeZone:"Asia/Kolkata"}));
}

setInterval(()=>{
  const ist = getIST();
  if(ist.getHours()===9 && ist.getMinutes()===20){
    BOT_ACTIVE=true;
  }
},60000);

setInterval(async ()=>{
  if(!BOT_ACTIVE || !access_token || position) return;

  const ist = getIST();
  if(ist.getHours()===9 && ist.getMinutes()<20) return;
  if(ist.getHours()===14 && ist.getMinutes()>=45) return;

  let best=null;

  for(const SYMBOL of STOCKS){
    const to=new Date();
    const from=new Date(Date.now()-50*5*60*1000);
    const candles=await kite.getHistoricalData(`${EXCHANGE}:${SYMBOL}`,"5minute",from,to);
    const prices=candles.map(c=>c.close);
    if(prices.length<30) continue;

    const e9=ema(prices,9);
    const e21=ema(prices,21);

    const crossUp=e9.at(-1)>e21.at(-1) && e9.at(-2)<=e21.at(-2);
    const crossDown=e9.at(-1)<e21.at(-1) && e9.at(-2)>=e21.at(-2);

    const score=aiScore(prices,candles);

    if(score>=50){
      if(!best || score>best.score){
        best={SYMBOL,score,crossUp,crossDown};
      }
    }
  }

  if(best){
    const ltpData=await kite.getLTP([`${EXCHANGE}:${best.SYMBOL}`]);
    const ltp=ltpData[`${EXCHANGE}:${best.SYMBOL}`].last_price;
    const qty=Math.max(1,Math.floor(MAX_TRADE_VALUE/ltp));

    if(best.crossUp){
      await kite.placeOrder("regular",{exchange:EXCHANGE,tradingsymbol:best.SYMBOL,transaction_type:"BUY",quantity:qty,product:PRODUCT,order_type:"MARKET"});
      position={symbol:best.SYMBOL,entry:ltp,qty,side:"LONG"};
    } else if(best.crossDown){
      await kite.placeOrder("regular",{exchange:EXCHANGE,tradingsymbol:best.SYMBOL,transaction_type:"SELL",quantity:qty,product:PRODUCT,order_type:"MARKET"});
      position={symbol:best.SYMBOL,entry:ltp,qty,side:"SHORT"};
    }
  }

},10000);

setInterval(async ()=>{
  if(!position) return;

  const ltpData=await kite.getLTP([`NSE:${position.symbol}`]);
  const ltp=ltpData[`NSE:${position.symbol}`].last_price;

  let pnlPct=(ltp-position.entry)/position.entry;
  if(position.side==="SHORT") pnlPct=-pnlPct;

  if(pnlPct<=-SL || pnlPct>=TP){
    await kite.placeOrder("regular",{exchange:"NSE",tradingsymbol:position.symbol,transaction_type:position.side==="LONG"?"SELL":"BUY",quantity:position.qty,product:"MIS",order_type:"MARKET"});
    position=null;
  }

},5000);

setInterval(()=>{
  const ist=getIST();
  if(ist.getHours()===15 && ist.getMinutes()===15){
    BOT_ACTIVE=false;
    position=null;
  }
},60000);

app.get("/",(req,res)=>res.sendFile(path.join(__dirname,"public/index.html")));
app.listen(process.env.PORT||8080);
