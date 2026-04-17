
require("dotenv").config();
const express = require("express");
const path = require("path");
const { KiteConnect } = require("kiteconnect");

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const kite = new KiteConnect({ api_key: process.env.KITE_API_KEY });

let access_token=null, BOT_ACTIVE=false, activeTrade=null, lastScan=[];
const STOCKS=["RELIANCE","HDFCBANK","ICICIBANK","INFY","TCS"];

let lastPrice={};

// IST TIME
function getIST(){
 const now=new Date();
 return new Date(now.toLocaleString("en-US",{timeZone:"Asia/Kolkata"}));
}
function getMins(){
 let t=getIST();
 return t.getHours()*60+t.getMinutes();
}

// AUTO
setInterval(()=>{
 let m=getMins();
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

// IMPROVED SIGNAL (multi condition)
function signal(p,prev){
 if(!prev) return null;
 let change=(p-prev)/prev;

 if(change>0.0015) return "BUY";   // faster than before
 if(change<-0.0015) return "SELL";
 return null;
}

// MAIN LOOP
setInterval(async()=>{
 if(!BOT_ACTIVE||!access_token) return;

 try{
 const prices=await kite.getLTP(STOCKS.map(s=>`NSE:${s}`));
 lastScan=[];
 let best=null,bestScore=0;

 for(let s of STOCKS){
  let p=prices[`NSE:${s}`].last_price;
  let prev=lastPrice[s];

  let sig=signal(p,prev);
  let score=prev?Math.abs((p-prev)/prev):0;

  lastScan.push({symbol:s,price:p,signal:sig,score});

  if(sig && score>bestScore){
    bestScore=score;
    best={symbol:s,price:p,signal:sig};
  }

  lastPrice[s]=p;
 }

 // EXIT (improved)
 if(activeTrade){
  let p=prices[`NSE:${activeTrade.symbol}`].last_price;
  let exit=false;

  if(activeTrade.type==="BUY"){
    if(p<=activeTrade.entry*0.995 || p>=activeTrade.entry*1.015) exit=true;
  }else{
    if(p>=activeTrade.entry*1.005 || p<=activeTrade.entry*0.985) exit=true;
  }

  if(exit){
    await kite.placeOrder("regular",{exchange:"NSE",tradingsymbol:activeTrade.symbol,transaction_type:activeTrade.type==="BUY"?"SELL":"BUY",quantity:1,product:"MIS",order_type:"MARKET"});
    activeTrade=null;
  }
  return;
 }

 // ENTRY
 if(best){
  await kite.placeOrder("regular",{exchange:"NSE",tradingsymbol:best.symbol,transaction_type:best.signal,quantity:1,product:"MIS",order_type:"MARKET"});
  activeTrade={symbol:best.symbol,type:best.signal,entry:best.price};
 }

 }catch(e){}
},3000);

app.get("/",(req,res)=>res.sendFile(path.join(__dirname,"public/index.html")));
app.listen(process.env.PORT||3000);
