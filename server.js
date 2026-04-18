
require("dotenv").config();
const express = require("express");
const path = require("path");
const { KiteConnect } = require("kiteconnect");

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const kite = new KiteConnect({ api_key: process.env.KITE_API_KEY });

// ===== STATE =====
let access_token=null, BOT_ACTIVE=false;
let activeTrades=[], lastScan=[], lastPrice={};
let lossStreak=0, dailyPnL=0;

// NEW: capital + feedback
let capital = 100000; // base capital (can change)
let tradeHistory = [];
let strategyStats = {
  momentum: {win:0, loss:0},
  mean: {win:0, loss:0}
};

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

// AUTO
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

// ===== ADDITIONS =====

// dynamic position sizing (1% capital risk proxy)
function getQty(price){
 let risk = capital * 0.01;
 return Math.max(1, Math.floor(risk/price));
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
 if(count===0) return null;
 let avg=sum/count;
 if(avg>0.0007) return "BULL";
 if(avg<-0.0007) return "BEAR";
 return "SIDEWAYS";
}

// strategies
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

// ===== LOOP =====
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

  let m1=momentum(p,prev);
  let m2=meanReversion(p,prev);
  let final = m1 || m2;

  lastScan.push({symbol:s,price:p,signal:final?.signal,bias,strategy:final?.type});

  if(final && activeTrades.length<2){
   if((bias==="BULL"&&final.signal==="BUY")||(bias==="BEAR"&&final.signal==="SELL")){

    let qty = getQty(p);

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

 // EXIT + feedback
 let newTrades=[];
 for(let t of activeTrades){
  let p=prices[`NSE:${t.symbol}`].last_price;
  let pnl=t.type==="BUY"?(p-t.entry)/t.entry:(t.entry-p)/t.entry;

  if(pnl>0.01 || pnl<-0.005){

    await kite.placeOrder("regular",{
      exchange:"NSE",
      tradingsymbol:t.symbol,
      transaction_type:t.type==="BUY"?"SELL":"BUY",
      quantity:t.qty,
      product:"MIS",
      order_type:"MARKET"
    });

    dailyPnL+=pnl;
    capital += capital * pnl;

    // feedback
    if(pnl>0) strategyStats[t.strategy].win++;
    else strategyStats[t.strategy].loss++;

    tradeHistory.push({...t,exit:p,pnl});

    pnl<0?lossStreak++:lossStreak=0;
  } else {
    newTrades.push(t);
  }
 }
 activeTrades=newTrades;

 }catch(e){}

},3000);

// ROOT
app.get("/",(req,res)=>res.sendFile(path.join(__dirname,"public/index.html")));
app.listen(process.env.PORT||3000);
