require("dotenv").config();
const express = require("express");
const path = require("path");
const { KiteConnect } = require("kiteconnect");

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const kite = new KiteConnect({ api_key: process.env.KITE_API_KEY });

let access_token=null, BOT_ACTIVE=false;
let capital=0, tradesToday=0;
let activeTrade=null;
let tradeLog=[];
let lastScan=[];
let lossStreak=0;
let dailyPnL=0;

const STOCKS = ["RELIANCE","HDFCBANK","ICICIBANK","INFY","TCS","SBIN","ITC","LT","AXISBANK","KOTAKBANK"];

const CONFIG = {
 MAX_TRADES:2,
 SL:0.01,
 TP:0.02,
 RISK:0.01,
 BASE_SCORE:0.0012,
 MAX_DD:-0.025,
 MAX_LOSS_STREAK:3
};

app.get("/login",(req,res)=>res.redirect(kite.getLoginURL()));

app.get("/redirect", async (req,res)=>{
 try{
  const s=await kite.generateSession(req.query.request_token, process.env.KITE_API_SECRET);
  access_token=s.access_token;
  kite.setAccessToken(access_token);
  res.send("Login Success");
 }catch{res.send("Login Failed")}
});

app.get("/start",(req,res)=>{BOT_ACTIVE=true;res.send("STARTED")});
app.get("/kill",(req,res)=>{BOT_ACTIVE=false;res.send("STOPPED")});

app.get("/dashboard", async (req,res)=>{
 try{
  if(access_token){
    const m=await kite.getMargins();
    capital=m?.equity?.net||0;
  }
 }catch{}
 res.json({capital,BOT_ACTIVE,tradesToday,activeTrade,lossStreak,dailyPnL});
});

app.get("/status",(req,res)=>res.json(lastScan));

async function getPrices(){
 try{
  return await kite.getLTP(STOCKS.map(s=>`NSE:${s}`));
 }catch{return null;}
}

function regime(vol){
 if(vol>0.003) return "TRENDING";
 if(vol<0.001) return "SIDEWAYS";
 return "NORMAL";
}

function adaptiveThreshold(vol){
 if(vol>0.003) return CONFIG.BASE_SCORE*1.2;
 if(vol<0.001) return CONFIG.BASE_SCORE*0.8;
 return CONFIG.BASE_SCORE;
}

function getSignal(price, prev){
 if(!prev) return null;
 let change=(price-prev)/prev;
 if(change>0.002) return "BUY";
 if(change<-0.002) return "SELL";
 return null;
}

function qty(price){
 let risk=capital*CONFIG.RISK;
 let sl=price*CONFIG.SL;
 return Math.max(1,Math.floor(risk/sl));
}

let last={};

setInterval(async ()=>{
 if(!BOT_ACTIVE || !access_token) return;

 if(dailyPnL <= CONFIG.MAX_DD*capital) return;
 if(lossStreak >= CONFIG.MAX_LOSS_STREAK) return;

 const prices = await getPrices();
 if(!prices) return;

 lastScan=[];
 let best=null, bestScore=0;

 for(let s of STOCKS){
   let p=prices[`NSE:${s}`].last_price;
   let prev=last[s];

   let vol = prev ? Math.abs((p-prev)/prev) : 0;
   let reg = regime(vol);
   let threshold = adaptiveThreshold(vol);
   let signal=getSignal(p,prev);
   let sc = vol;

   let decision="SKIP";
   if(sc>threshold && signal && reg!=="SIDEWAYS") decision="READY";

   lastScan.push({symbol:s,price:p,score:sc,signal,regime:reg,decision});

   if(sc>bestScore){
     bestScore=sc;
     best={symbol:s, price:p, prev};
   }

   last[s]=p;
 }

 if(activeTrade){
   const p = prices[`NSE:${activeTrade.symbol}`].last_price;

   let exit=false, pnl=0;

   if(activeTrade.type==="BUY"){
     if(p<=activeTrade.entry*(1-CONFIG.SL) || p>=activeTrade.entry*(1+CONFIG.TP)){
       pnl=(p-activeTrade.entry)*activeTrade.qty;
       exit=true;
     }
   } else {
     if(p>=activeTrade.entry*(1+CONFIG.SL) || p<=activeTrade.entry*(1-CONFIG.TP)){
       pnl=(activeTrade.entry-p)*activeTrade.qty;
       exit=true;
     }
   }

   if(exit){
     await kite.placeOrder("regular",{
       exchange:"NSE",
       tradingsymbol:activeTrade.symbol,
       transaction_type: activeTrade.type==="BUY"?"SELL":"BUY",
       quantity:activeTrade.qty,
       product:"MIS",
       order_type:"MARKET"
     });

     tradeLog.push({pnl});
     dailyPnL += pnl;
     if(pnl<0) lossStreak++; else lossStreak=0;

     activeTrade=null;
   }

   return;
 }

 if(tradesToday>=CONFIG.MAX_TRADES) return;
 if(!best || bestScore<CONFIG.BASE_SCORE) return;

 let signal=getSignal(best.price,best.prev);
 if(!signal) return;

 let q=qty(best.price);

 await kite.placeOrder("regular",{
   exchange:"NSE",
   tradingsymbol:best.symbol,
   transaction_type:signal,
   quantity:q,
   product:"MIS",
   order_type:"LIMIT",
   price: signal==="BUY"?best.price*1.001:best.price*0.999
 });

 activeTrade={symbol:best.symbol,type:signal,entry:best.price,qty:q};
 tradesToday++;

},3000);

setInterval(()=>{
 tradesToday=0;
 dailyPnL=0;
 lossStreak=0;
},86400000);

const PORT=process.env.PORT||3000;
app.listen(PORT,()=>console.log("8.5 FINAL BOT RUNNING"));