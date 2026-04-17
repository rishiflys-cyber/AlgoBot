
require("dotenv").config();
const express=require("express");
const path=require("path");
const {KiteConnect}=require("kiteconnect");

const app=express();
app.use(express.json());
app.use(express.static(path.join(__dirname,"public")));

const kite=new KiteConnect({api_key:process.env.KITE_API_KEY});

let access_token=null,BOT_ACTIVE=false,activeTrade=null,lastScan=[];
const STOCKS=["RELIANCE","HDFCBANK","ICICIBANK","INFY","TCS"];

// IST TIME FUNCTION
function getISTMinutes(){
  const now = new Date();
  const ist = new Date(now.toLocaleString("en-US",{timeZone:"Asia/Kolkata"}));
  return ist.getHours()*60 + ist.getMinutes();
}

function isMarketTime(){
  let mins=getISTMinutes();
  return mins>=560 && mins<=930; // 9:20–15:30 IST
}

// AUTO START/STOP IST
setInterval(()=>{
  let mins=getISTMinutes();

  if(mins===560){
    BOT_ACTIVE=true;
    console.log("AUTO START IST");
  }

  if(mins===930){
    BOT_ACTIVE=false;
    console.log("AUTO STOP IST");
  }
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

// SIGNAL
let lastPrice={};
function getSignal(p,prev){
 if(!prev) return null;
 let c=(p-prev)/prev;
 if(c>0.002) return "BUY";
 if(c<-0.002) return "SELL";
 return null;
}

// MAIN LOOP
setInterval(async()=>{
 if(!BOT_ACTIVE||!access_token||!isMarketTime()) return;

 const prices=await kite.getLTP(STOCKS.map(s=>`NSE:${s}`));
 lastScan=[];
 let best=null, bestScore=0;

 for(let s of STOCKS){
  let p=prices[`NSE:${s}`].last_price;
  let prev=lastPrice[s];

  let signal=getSignal(p,prev);
  let score=prev?Math.abs((p-prev)/prev):0;

  lastScan.push({symbol:s,price:p,signal,score});

  if(signal&&score>bestScore){
    bestScore=score;
    best={symbol:s,price:p,signal};
  }

  lastPrice[s]=p;
 }

 if(activeTrade){
  let p=prices[`NSE:${activeTrade.symbol}`].last_price;
  let exit=false;

  if(activeTrade.type==="BUY"){
    if(p<=activeTrade.entry*0.99||p>=activeTrade.entry*1.02) exit=true;
  }else{
    if(p>=activeTrade.entry*1.01||p<=activeTrade.entry*0.98) exit=true;
  }

  if(exit){
    await kite.placeOrder("regular",{exchange:"NSE",tradingsymbol:activeTrade.symbol,transaction_type:activeTrade.type==="BUY"?"SELL":"BUY",quantity:1,product:"MIS",order_type:"MARKET"});
    activeTrade=null;
  }
  return;
 }

 if(best){
  await kite.placeOrder("regular",{exchange:"NSE",tradingsymbol:best.symbol,transaction_type:best.signal,quantity:1,product:"MIS",order_type:"MARKET"});
  activeTrade={symbol:best.symbol,type:best.signal,entry:best.price};
 }

},3000);

app.get("/",(req,res)=>res.sendFile(path.join(__dirname,"public/index.html")));

app.listen(process.env.PORT||3000);
