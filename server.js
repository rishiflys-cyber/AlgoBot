
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

// NEW: statistical memory
let priceHistory = {};
let rollingStats = {};

const STOCKS=["RELIANCE","HDFCBANK","ICICIBANK","INFY","TCS"];

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

// CONTROL
app.get("/start",(req,res)=>{BOT_ACTIVE=true;res.send("STARTED")});
app.get("/kill",(req,res)=>{BOT_ACTIVE=false;res.send("STOPPED")});
app.get("/status",(req,res)=>res.json(lastScan));

// ===== QUANT LAYER ADDITION =====

// rolling mean + std (lightweight)
function updateStats(symbol, price){
 if(!priceHistory[symbol]) priceHistory[symbol]=[];
 priceHistory[symbol].push(price);

 if(priceHistory[symbol].length>20){
  priceHistory[symbol].shift();
 }

 let arr=priceHistory[symbol];
 let mean=arr.reduce((a,b)=>a+b,0)/arr.length;
 let variance=arr.reduce((a,b)=>a+(b-mean)**2,0)/arr.length;
 let std=Math.sqrt(variance);

 rollingStats[symbol]={mean,std};
}

// z-score
function getZScore(symbol, price){
 let stat=rollingStats[symbol];
 if(!stat || stat.std===0) return 0;
 return (price - stat.mean)/stat.std;
}

// regime
function detectRegime(prices){
 let vol=0,count=0;
 for(let s of STOCKS){
  let p=prices[`NSE:${s}`].last_price;
  if(lastPrice[s]){
    vol+=Math.abs((p-lastPrice[s])/lastPrice[s]);
    count++;
  }
 }
 let avg=vol/count;
 return avg>0.002?"TREND":"SIDEWAYS";
}

// bias
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

// qty
function getQty(price){
 let risk=capital*0.01;
 return Math.max(1,Math.floor(risk/price));
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

  updateStats(s,p);
  let z=getZScore(s,p);

  // quant signal
  let signal=null;
  if(regime==="TREND"){
    if(z>1) signal="BUY";
    if(z<-1) signal="SELL";
  } else {
    if(z<-1.5) signal="BUY";
    if(z>1.5) signal="SELL";
  }

  lastScan.push({symbol:s,price:p,signal,bias,regime,zscore:z});

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

 // exits
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
