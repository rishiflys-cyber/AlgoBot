
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
 BASE_SCORE:0.0015,
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

// ===== HELPERS =====
async function getPrices(){
 try{
  return await kite.getLTP(STOCKS.map(s=>`NSE:${s}`));
 }catch{return null;}
}

function isMarketTime(){
 let now=new Date();
 let t=now.getHours()*60+now.getMinutes();
 return t>=560 && t<=885; // 9:20–14:45
}

function regime(vol){
 if(vol>0.003) return "TRENDING";
 if(vol<0.001) return "SIDEWAYS";
 return "NORMAL";
}

function getSignal(price, prev){
 if(!prev) return null;
 let change=(price-prev)/prev;
 if(change>0.002) return "BUY";
 if(change<-0.002) return "SELL";
 return null;
}

function calculateScore(price, prev, trendAlign){
 if(!prev) return 0;
 let m = Math.abs((price-prev)/prev);
 return (m*0.4)+(m*0.3)+(trendAlign?0.3:0);
}

function qty(price, vol){
 let risk=capital*CONFIG.RISK;
 let adj = vol>0.003 ? 0.7 : 1;
 let sl=price*CONFIG.SL;
 return Math.max(1,Math.floor((risk*adj)/sl));
}

let last={};

// ===== MAIN LOOP =====
setInterval(async ()=>{
 if(!BOT_ACTIVE || !access_token) return;
 if(!isMarketTime()) return;
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
   let sig = getSignal(p,prev);
   let trendAlign = sig && ((p>prev && sig==="BUY")||(p<prev && sig==="SELL"));
   let sc = calculateScore(p,prev,trendAlign);

   let decision="SKIP";
   if(sc>CONFIG.BASE_SCORE && sig && reg!=="SIDEWAYS" && trendAlign) decision="READY";

   lastScan.push({symbol:s,price:p,score:sc,signal:sig,regime:reg,decision});

   if(sc>bestScore){
     bestScore=sc;
     best={symbol:s, price:p, prev, vol};
   }

   last[s]=p;
 }

 if(activeTrade){
   const p = prices[`NSE:${activeTrade.symbol}`].last_price;
   let exit=false, pnl=0;

   // trailing
   let profit = activeTrade.type==="BUY" ? (p-activeTrade.entry)/activeTrade.entry : (activeTrade.entry-p)/activeTrade.entry;
   if(profit>0.01) activeTrade.trailing = activeTrade.entry*1.005;
   if(profit>0.005) activeTrade.trailing = activeTrade.entry;

   if(activeTrade.trailing){
     if(activeTrade.type==="BUY" && p<=activeTrade.trailing) exit=true;
     if(activeTrade.type==="SELL" && p>=activeTrade.trailing) exit=true;
   }

   // SL TP
   if(activeTrade.type==="BUY"){
     if(p<=activeTrade.entry*(1-CONFIG.SL) || p>=activeTrade.entry*(1+CONFIG.TP)) exit=true;
     pnl=(p-activeTrade.entry)*activeTrade.qty;
   } else {
     if(p>=activeTrade.entry*(1+CONFIG.SL) || p<=activeTrade.entry*(1-CONFIG.TP)) exit=true;
     pnl=(activeTrade.entry-p)*activeTrade.qty;
   }

   // time exit
   if(Date.now()-activeTrade.start>600000) exit=true;

   if(exit){
     await kite.placeOrder("regular",{
       exchange:"NSE",
       tradingsymbol:activeTrade.symbol,
       transaction_type: activeTrade.type==="BUY"?"SELL":"BUY",
       quantity:activeTrade.qty,
       product:"MIS",
       order_type:"MARKET"
     });

     dailyPnL += pnl;
     if(pnl<0) lossStreak++; else lossStreak=0;
     activeTrade=null;
   }
   return;
 }

 if(tradesToday>=CONFIG.MAX_TRADES) return;
 if(!best || bestScore<CONFIG.BASE_SCORE) return;

 let sig=getSignal(best.price,best.prev);
 if(!sig) return;

 let q=qty(best.price, best.vol);

 await kite.placeOrder("regular",{
   exchange:"NSE",
   tradingsymbol:best.symbol,
   transaction_type:sig,
   quantity:q,
   product:"MIS",
   order_type:"LIMIT",
   price: sig==="BUY"?best.price*1.001:best.price*0.999
 });

 activeTrade={symbol:best.symbol,type:sig,entry:best.price,qty:q,start:Date.now()};
 tradesToday++;

},3000);

setInterval(()=>{
 tradesToday=0;
 dailyPnL=0;
 lossStreak=0;
},86400000);

const PORT=process.env.PORT||3000;
app.listen(PORT,()=>console.log("9 FINAL BOT RUNNING"));
