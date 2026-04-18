
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
let strategyStats = {
  momentum: {win:0, loss:0},
  mean: {win:0, loss:0}
};

const STOCKS=["RELIANCE","HDFCBANK","ICICIBANK","INFY","TCS"];

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

// ===== NEW PRECISION LAYER =====

// regime detection
function detectRegime(prices){
 let volSum=0,count=0;
 for(let s of STOCKS){
  let p=prices[`NSE:${s}`].last_price;
  if(lastPrice[s]){
    volSum+=Math.abs((p-lastPrice[s])/lastPrice[s]);
    count++;
  }
 }
 let avg=volSum/count;
 if(avg>0.002) return "TREND";
 return "SIDEWAYS";
}

// correlation filter (simple)
function isDuplicate(symbol){
 return activeTrades.some(t=>t.symbol===symbol);
}

// trailing exit
function trailingExit(trade, price){
 let pnl = trade.type==="BUY"?(price-trade.entry)/trade.entry:(trade.entry-price)/trade.entry;

 if(pnl>0.015) return true;
 if(pnl<-0.005) return true;

 return false;
}

// ===== EXISTING + ENHANCED =====

function getMarketBias(prices){
 let sum=0,count=0;
 for(let s of STOCKS){
  let p=prices[`NSE:${s}`].last_price;
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

function momentum(p,prev){
 if(!prev) return null;
 let c=(p-prev)/prev;
 if(Math.abs(c)<0.0012) return null;
 return {signal:c>0?"BUY":"SELL", type:"momentum"};
}

function meanReversion(p,prev){
 if(!prev) return null;
 let c=(p-prev)/prev;
 if(c<-0.002) return {signal:"BUY", type:"mean"};
 if(c>0.002) return {signal:"SELL", type:"mean"};
 return null;
}

function getQty(price){
 let risk = capital * 0.01;
 return Math.max(1, Math.floor(risk/price));
}

// ===== LOOP =====

setInterval(async()=>{
 if(!BOT_ACTIVE||!access_token) return;
 if(lossStreak>=3) return;
 if(dailyPnL<=-0.02) return;

 try{
 const prices=await kite.getLTP(STOCKS.map(s=>`NSE:${s}`));
 let bias=getMarketBias(prices);
 let regime=detectRegime(prices);

 lastScan=[];

 for(let s of STOCKS){
  let p=prices[`NSE:${s}`].last_price;
  let prev=lastPrice[s];

  let m1=momentum(p,prev);
  let m2=meanReversion(p,prev);

  // regime switching
  let final = regime==="TREND" ? m1 : m2;

  lastScan.push({symbol:s,price:p,signal:final?.signal,bias,regime,strategy:final?.type});

  if(final && activeTrades.length<2 && !isDuplicate(s)){
   if((bias==="BULL"&&final.signal==="BUY")||(bias==="BEAR"&&final.signal==="SELL")){

    let qty=getQty(p);

    await kite.placeOrder("regular",{
      exchange:"NSE",
      tradingsymbol:s,
      transaction_type:final.signal,
      quantity:qty,
      product:"MIS",
      order_type:"MARKET"
    });

    activeTrades.push({symbol:s,type:final.signal,entry:p,qty,strategy:final.type});
   }
  }

  lastPrice[s]=p;
 }

 // exits
 let newTrades=[];
 for(let t of activeTrades){
  let p=prices[`NSE:${t.symbol}`].last_price;

  if(trailingExit(t,p)){
    await kite.placeOrder("regular",{
      exchange:"NSE",
      tradingsymbol:t.symbol,
      transaction_type:t.type==="BUY"?"SELL":"BUY",
      quantity:t.qty,
      product:"MIS",
      order_type:"MARKET"
    });

    let pnl = t.type==="BUY"?(p-t.entry)/t.entry:(t.entry-p)/t.entry;

    capital += capital * pnl;
    pnl<0?lossStreak++:lossStreak=0;

    if(pnl>0) strategyStats[t.strategy].win++;
    else strategyStats[t.strategy].loss++;
  } else {
    newTrades.push(t);
  }
 }
 activeTrades=newTrades;

 }catch(e){}

},3000);

app.get("/",(req,res)=>res.sendFile(path.join(__dirname,"public/index.html")));
app.listen(process.env.PORT||3000);
