
require("dotenv").config();
const express = require("express");
const path = require("path");
const { KiteConnect } = require("kiteconnect");

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const kite = new KiteConnect({ api_key: process.env.KITE_API_KEY });

let access_token=null, BOT_ACTIVE=false;
let tradesToday=0, position=null, entryPrice=0;
let pnl=0, capital=0, lossStreak=0;
let lastPrice=null;

let stats = {wins:0, losses:0};

const CONFIG = {
  MAX_TRADES:2,
  SL:0.008,
  TP:0.018,
  PRICE_JUMP:0.002,
  VOL_FILTER:0.0015,
  LOSS_STREAK_LIMIT:2
};

// LOGIN
app.get("/login",(req,res)=>res.redirect(kite.getLoginURL()));
app.get("/redirect", async (req,res)=>{
 try{
  const s=await kite.generateSession(req.query.request_token, process.env.KITE_API_SECRET);
  access_token=s.access_token;
  kite.setAccessToken(access_token);
  res.send("Login Success ✅");
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
 res.json({capital,BOT_ACTIVE,position,tradesToday,pnl,lossStreak,stats});
});

// PRICE
async function getPrice(sym="RELIANCE"){
 try{
  const q=await kite.getLTP([`NSE:${sym}`]);
  return q[`NSE:${sym}`].last_price;
 }catch{return null;}
}

// MARKET CONTEXT (NIFTY)
async function getMarketDirection(){
 try{
  const q=await kite.getLTP(["NSE:NIFTY 50"]);
  return q["NSE:NIFTY 50"].last_price;
 }catch{return null;}
}

// MULTI STRATEGY
function trendStrategy(price){
 if(!lastPrice) return null;
 let change=(price-lastPrice)/lastPrice;
 if(Math.abs(change)<CONFIG.VOL_FILTER) return null;
 if(change>CONFIG.PRICE_JUMP) return "BUY";
 if(change<-CONFIG.PRICE_JUMP) return "SELL";
 return null;
}

function meanReversion(price){
 if(!lastPrice) return null;
 let change=(price-lastPrice)/lastPrice;
 if(change>0.004) return "SELL";
 if(change<-0.004) return "BUY";
 return null;
}

// SIMPLE LEARNING (disable losing mode)
function chooseStrategy(){
 if(stats.losses > stats.wins) return "trend";
 return "mean";
}

// LOOP
setInterval(async ()=>{
 if(!BOT_ACTIVE || !access_token) return;
 if(tradesToday>=CONFIG.MAX_TRADES) return;
 if(lossStreak>=CONFIG.LOSS_STREAK_LIMIT) return;

 const price = await getPrice();
 const market = await getMarketDirection();
 if(!price || !market) return;

 // manage open
 if(position){
   let exit=false;

   if(position==="BUY"){
     if(price<=entryPrice*(1-CONFIG.SL)){ pnl-=entryPrice*CONFIG.SL; lossStreak++; stats.losses++; exit=true; }
     if(price>=entryPrice*(1+CONFIG.TP)){ pnl+=entryPrice*CONFIG.TP; lossStreak=0; stats.wins++; exit=true; }
   }

   if(exit) position=null;
   return;
 }

 let strategy = chooseStrategy();
 let signal = strategy==="trend" ? trendStrategy(price) : meanReversion(price);

 lastPrice=price;
 if(!signal) return;

 try{
  await kite.placeOrder("regular",{
   exchange:"NSE",
   tradingsymbol:"RELIANCE",
   transaction_type:signal,
   quantity:1,
   product:"MIS",
   order_type:"MARKET"
  });

  position=signal;
  entryPrice=price;
  tradesToday++;

 }catch{}

},3000);

// RESET
setInterval(()=>{tradesToday=0;pnl=0;lossStreak=0;stats={wins:0,losses:0}},86400000);

// PORT
const PORT=process.env.PORT||3000;
app.listen(PORT,()=>console.log("8.5 GAP CLOSED BOT",PORT));
