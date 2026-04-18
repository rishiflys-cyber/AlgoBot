
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

// ===== ADDITIONS START =====

// 1. INDEX BIAS (proxy using basket)
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

// 2. VOLATILITY (ATR proxy)
function getVolatility(p,prev){
 if(!prev) return 0;
 return Math.abs((p-prev)/prev);
}

// 3. MULTI STRATEGY
function momentum(p,prev){
 if(!prev) return null;
 let c=(p-prev)/prev;
 if(Math.abs(c)<0.0012) return null;
 return c>0?"BUY":"SELL";
}

function meanReversion(p,prev){
 if(!prev) return null;
 let c=(p-prev)/prev;
 if(c<-0.002) return "BUY";
 if(c>0.002) return "SELL";
 return null;
}

// ===== MAIN LOOP =====
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

  let vol=getVolatility(p,prev);
  let sig1=momentum(p,prev);
  let sig2=meanReversion(p,prev);

  let signal=sig1||sig2;

  lastScan.push({symbol:s,price:p,signal,bias,vol});

  // ENTRY
  if(signal && activeTrades.length<2){
   if(vol>0.001 && ((bias==="BULL"&&signal==="BUY")||(bias==="BEAR"&&signal==="SELL"))){

    await kite.placeOrder("regular",{
      exchange:"NSE",
      tradingsymbol:s,
      transaction_type:signal,
      quantity:1,
      product:"MIS",
      order_type:"MARKET"
    });

    activeTrades.push({symbol:s,type:signal,entry:p});
   }
  }

  lastPrice[s]=p;
 }

 // EXIT
 let newTrades=[];
 for(let t of activeTrades){
  let p=prices[`NSE:${t.symbol}`].last_price;
  let pnl=t.type==="BUY"?(p-t.entry)/t.entry:(t.entry-p)/t.entry;

  if(pnl>0.01 || pnl<-0.005){
    await kite.placeOrder("regular",{
      exchange:"NSE",
      tradingsymbol:t.symbol,
      transaction_type:t.type==="BUY"?"SELL":"BUY",
      quantity:1,
      product:"MIS",
      order_type:"MARKET"
    });

    dailyPnL+=pnl;
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
