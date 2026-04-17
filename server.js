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

const STOCKS = ["RELIANCE","HDFCBANK","ICICIBANK","INFY","TCS","SBIN","ITC","LT","AXISBANK","KOTAKBANK"];

const CONFIG = {
 MAX_TRADES:2,
 SL:0.01,
 TP:0.02,
 RISK:0.01,
 MIN_SCORE:0.0012
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
 res.json({capital,BOT_ACTIVE,tradesToday,activeTrade});
});

app.get("/status",(req,res)=>{
 res.json(lastScan);
});

async function getPrices(){
 try{
  return await kite.getLTP(STOCKS.map(s=>`NSE:${s}`));
 }catch{return null;}
}

async function getPrice(symbol){
 try{
  const q=await kite.getLTP([`NSE:${symbol}`]);
  return q[`NSE:${symbol}`].last_price;
 }catch{return null;}
}

function score(price, prev){
 if(!prev) return 0;
 return Math.abs((price-prev)/prev);
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

 const prices = await getPrices();
 if(!prices) return;

 lastScan=[];

 let best=null, bestScore=0;

 for(let s of STOCKS){
   let p=prices[`NSE:${s}`].last_price;
   let sc=score(p,last[s]);
   let sig=getSignal(p,last[s]);

   let decision="SKIP";
   if(sc>CONFIG.MIN_SCORE && sig) decision="READY";

   lastScan.push({symbol:s,price:p,score:sc,signal:sig,decision});

   if(sc>bestScore){
     bestScore=sc;
     best={symbol:s, price:p, prev:last[s]};
   }

   last[s]=p;
 }

 if(activeTrade){
   let price = await getPrice(activeTrade.symbol);
   if(!price) return;

   let exit=false, pnl=0;

   if(activeTrade.type==="BUY"){
     if(price<=activeTrade.entry*(1-CONFIG.SL) || price>=activeTrade.entry*(1+CONFIG.TP)){
       pnl=(price-activeTrade.entry)*activeTrade.qty;
       exit=true;
     }
   }

   if(activeTrade.type==="SELL"){
     if(price>=activeTrade.entry*(1+CONFIG.SL) || price<=activeTrade.entry*(1-CONFIG.TP)){
       pnl=(activeTrade.entry-price)*activeTrade.qty;
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
     activeTrade=null;
   }

   return;
 }

 if(tradesToday>=CONFIG.MAX_TRADES) return;

 if(!best || bestScore<CONFIG.MIN_SCORE) return;

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

setInterval(()=>{tradesToday=0},86400000);

const PORT=process.env.PORT||3000;
app.listen(PORT,()=>console.log("FINAL VISIBILITY BOT RUNNING"));