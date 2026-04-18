
require("dotenv").config();
const express = require("express");
const path = require("path");
const { KiteConnect } = require("kiteconnect");

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const kite = new KiteConnect({ api_key: process.env.KITE_API_KEY });

let access_token=null, BOT_ACTIVE=false;
let activeTrades=[], lastScan=[], lastPrice={};
let lossStreak=0, dailyPnL=0;
let capital = 100000;

// ===== NEW RESEARCH ENGINE =====
let historicalTrades = [];
let performanceStats = {
  total:0,
  wins:0,
  losses:0,
  pnl:0
};

// backtest simulation (lightweight)
function simulateTrade(entry, exit, type){
  let pnl = type==="BUY" ? (exit-entry)/entry : (entry-exit)/entry;
  performanceStats.total++;
  performanceStats.pnl += pnl;
  if(pnl>0) performanceStats.wins++;
  else performanceStats.losses++;
}

// adaptive threshold (dynamic tuning)
let dynamicThreshold = 0.0012;

function adjustThreshold(){
  if(performanceStats.total < 10) return;
  let winRate = performanceStats.wins / performanceStats.total;

  if(winRate < 0.4) dynamicThreshold += 0.0002;
  if(winRate > 0.6) dynamicThreshold -= 0.0001;

  if(dynamicThreshold < 0.0008) dynamicThreshold = 0.0008;
  if(dynamicThreshold > 0.002) dynamicThreshold = 0.002;
}

// ===== TIME =====
function getIST(){
 const now=new Date();
 return new Date(now.toLocaleString("en-US",{timeZone:"Asia/Kolkata"}));
}
function mins(){
 let t=getIST();
 return t.getHours()*60+t.getMinutes();
}

setInterval(()=>{
 let m=mins();
 if(m===560) BOT_ACTIVE=true;
 if(m===930) BOT_ACTIVE=false;
},60000);

// LOGIN
app.get("/login",(req,res)=>res.redirect(kite.getLoginURL()));
app.get("/redirect",async(req,res)=>{
 const s=await kite.generateSession(req.query.request_token,process.env.KITE_API_SECRET);
 access_token=s.access_token;
 kite.setAccessToken(access_token);
 res.send("OK");
});

app.get("/start",(req,res)=>{BOT_ACTIVE=true;res.send("STARTED")});
app.get("/kill",(req,res)=>{BOT_ACTIVE=false;res.send("STOPPED")});
app.get("/status",(req,res)=>res.json(lastScan));

// ===== CORE LOGIC (kept + enhanced) =====

function getMarketBias(prices){
 let sum=0,count=0;
 for(let s in prices){
  let p=prices[s].last_price;
  if(lastPrice[s]){
    sum+=(p-lastPrice[s])/lastPrice[s];
    count++;
  }
 }
 let avg=sum/count;
 if(avg>0.0007) return "BULL";
 if(avg<-0.0007) return "BEAR";
 return "SIDEWAYS";
}

function getQty(price){
 let risk = capital * 0.01;
 return Math.max(1, Math.floor(risk/price));
}

// ===== LOOP =====
const STOCKS=["RELIANCE","HDFCBANK","ICICIBANK","INFY","TCS"];

setInterval(async()=>{
 if(!BOT_ACTIVE||!access_token) return;
 if(lossStreak>=3) return;
 if(dailyPnL<=-0.02) return;

 try{
 const prices=await kite.getLTP(STOCKS.map(s=>`NSE:${s}`));
 let bias=getMarketBias(prices);

 lastScan=[];

 for(let s of STOCKS){
  let p=prices[`NSE:${s}`].last_price;
  let prev=lastPrice[s];

  let change = prev ? (p-prev)/prev : 0;

  let signal=null;
  if(Math.abs(change)>dynamicThreshold){
    signal = change>0?"BUY":"SELL";
  }

  lastScan.push({symbol:s,price:p,signal,bias,threshold:dynamicThreshold});

  if(signal && activeTrades.length<2){
   if((bias==="BULL"&&signal==="BUY")||(bias==="BEAR"&&signal==="SELL")){
    let qty=getQty(p);

    await kite.placeOrder("regular",{
      exchange:"NSE",
      tradingsymbol:s,
      transaction_type:signal,
      quantity:qty,
      product:"MIS",
      order_type:"MARKET"
    });

    activeTrades.push({symbol:s,type:signal,entry:p,qty});
   }
  }

  lastPrice[s]=p;
 }

 // EXIT + research tracking
 let newTrades=[];
 for(let t of activeTrades){
  let p=prices[`NSE:${t.symbol}`].last_price;
  let pnl=t.type==="BUY"?(p-t.entry)/t.entry:(t.entry-p)/t.entry;

  if(pnl>0.015 || pnl<-0.005){
    await kite.placeOrder("regular",{
      exchange:"NSE",
      tradingsymbol:t.symbol,
      transaction_type:t.type==="BUY"?"SELL":"BUY",
      quantity:t.qty,
      product:"MIS",
      order_type:"MARKET"
    });

    capital += capital*pnl;
    simulateTrade(t.entry,p,t.type);
    adjustThreshold();

    pnl<0?lossStreak++:lossStreak=0;
  } else {
    newTrades.push(t);
  }
 }
 activeTrades=newTrades;

 }catch(e){}

},3000);

app.get("/",(req,res)=>res.sendFile(path.join(__dirname,"public/index.html")));
app.listen(process.env.PORT||3000);
