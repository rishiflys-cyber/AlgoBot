
require("dotenv").config();
const express = require("express");
const path = require("path");
const { KiteConnect } = require("kiteconnect");

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const kite = new KiteConnect({ api_key: process.env.KITE_API_KEY });

let access_token=null, BOT_ACTIVE=false;
let tradesToday=0, capital=0;

let activeTrade = null;
let tradeLog = [];

const STOCKS = ["RELIANCE","HDFCBANK","ICICIBANK","INFY","TCS"];

const CONFIG = {
  MAX_TRADES:2,
  SL:0.01,
  TP:0.02,
  RISK_PER_TRADE:0.01
};

// LOGIN
app.get("/login",(req,res)=>res.redirect(kite.getLoginURL()));

app.get("/redirect", async (req,res)=>{
 try{
  const s=await kite.generateSession(req.query.request_token, process.env.KITE_API_SECRET);
  access_token=s.access_token;
  kite.setAccessToken(access_token);
  res.send("Login Success");
 }catch{res.send("Login Failed")}
});

// CONTROL
app.get("/start",(req,res)=>{BOT_ACTIVE=true;res.send("STARTED")});
app.get("/kill",(req,res)=>{BOT_ACTIVE=false;res.send("STOPPED")});

// DASHBOARD
app.get("/dashboard", async (req,res)=>{
 try{
  if(access_token){
    const m=await kite.getMargins();
    capital=m?.equity?.net||0;
  }
 }catch{}
 res.json({capital,BOT_ACTIVE,tradesToday,activeTrade});
});

// PERFORMANCE
app.get("/performance",(req,res)=>{
 let wins = tradeLog.filter(t=>t.pnl>0).length;
 let losses = tradeLog.filter(t=>t.pnl<0).length;
 let total = tradeLog.length;

 let avgWin = wins ? tradeLog.filter(t=>t.pnl>0).reduce((a,b)=>a+b.pnl,0)/wins : 0;
 let avgLoss = losses ? Math.abs(tradeLog.filter(t=>t.pnl<0).reduce((a,b)=>a+b.pnl,0)/losses) : 0;

 let winRate = total ? (wins/total)*100 : 0;
 let rr = avgLoss ? avgWin/avgLoss : 0;
 let expectancy = (winRate/100)*avgWin - (1-winRate/100)*avgLoss;

 res.json({total,wins,losses,winRate,avgWin,avgLoss,rr,expectancy});
});

// PRICE
async function getPrice(symbol){
 try{
  const q = await kite.getLTP([`NSE:${symbol}`]);
  return q[`NSE:${symbol}`].last_price;
 }catch{return null;}
}

// POSITION SIZE
function getQty(price){
 let risk = capital * CONFIG.RISK_PER_TRADE;
 let slDist = price * CONFIG.SL;
 return Math.max(1, Math.floor(risk / slDist));
}

// SIGNAL
function getSignal(price, prev){
 if(!prev) return null;
 let change = (price-prev)/prev;
 if(change > 0.002) return "BUY";
 if(change < -0.002) return "SELL";
 return null;
}

let lastPrices = {};

// MAIN LOOP
setInterval(async ()=>{
 if(!BOT_ACTIVE || !access_token) return;

 // manage active trade
 if(activeTrade){
   const price = await getPrice(activeTrade.symbol);
   if(!price) return;

   let exit = false;
   let pnl = 0;

   if(activeTrade.type==="BUY"){
     if(price <= activeTrade.entry*(1-CONFIG.SL)){
       pnl = (price - activeTrade.entry)*activeTrade.qty;
       exit = true;
     }
     if(price >= activeTrade.entry*(1+CONFIG.TP)){
       pnl = (price - activeTrade.entry)*activeTrade.qty;
       exit = true;
     }
   }

   if(activeTrade.type==="SELL"){
     if(price >= activeTrade.entry*(1+CONFIG.SL)){
       pnl = (activeTrade.entry - price)*activeTrade.qty;
       exit = true;
     }
     if(price <= activeTrade.entry*(1-CONFIG.TP)){
       pnl = (activeTrade.entry - price)*activeTrade.qty;
       exit = true;
     }
   }

   if(exit){
     try{
       await kite.placeOrder("regular",{
         exchange:"NSE",
         tradingsymbol:activeTrade.symbol,
         transaction_type: activeTrade.type==="BUY"?"SELL":"BUY",
         quantity:activeTrade.qty,
         product:"MIS",
         order_type:"MARKET"
       });

       tradeLog.push({pnl});
       activeTrade = null;

     }catch(e){}
   }

   return;
 }

 // new trade
 if(tradesToday >= CONFIG.MAX_TRADES) return;

 const symbol = STOCKS[Math.floor(Math.random()*STOCKS.length)];
 const price = await getPrice(symbol);
 if(!price) return;

 const prev = lastPrices[symbol];
 const signal = getSignal(price, prev);
 lastPrices[symbol] = price;

 if(!signal) return;

 let qty = getQty(price);

 try{
   await kite.placeOrder("regular",{
     exchange:"NSE",
     tradingsymbol:symbol,
     transaction_type:signal,
     quantity:qty,
     product:"MIS",
     order_type:"MARKET"
   });

   activeTrade = {symbol, type:signal, entry:price, qty};
   tradesToday++;

 }catch(e){}

},3000);

// RESET
setInterval(()=>{tradesToday=0},86400000);

const PORT=process.env.PORT||3000;
app.listen(PORT,()=>console.log("FINAL COMPLETE BOT RUNNING"));
