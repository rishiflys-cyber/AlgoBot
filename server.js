
require("dotenv").config();
const express = require("express");
const path = require("path");
const { KiteConnect } = require("kiteconnect");

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const kite = new KiteConnect({ api_key: process.env.KITE_API_KEY });

let access_token=null, BOT_ACTIVE=false, activeTrade=null, lastScan=[];
let lastPrice={}, lossStreak=0, dailyPnL=0;

const STOCKS=["RELIANCE","HDFCBANK","ICICIBANK","INFY","TCS"];

// IST TIME
function getIST(){
 const now=new Date();
 return new Date(now.toLocaleString("en-US",{timeZone:"Asia/Kolkata"}));
}
function mins(){
 let t=getIST();
 return t.getHours()*60+t.getMinutes();
}

// AUTO START/STOP
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

// STRATEGY (multi-layer)
function getSignal(p,prev){
 if(!prev) return null;
 let change=(p-prev)/prev;

 if(change>0.0015) return "BUY";
 if(change<-0.0015) return "SELL";
 return null;
}

// MAIN LOOP
setInterval(async()=>{
 if(!BOT_ACTIVE || !access_token) return;

 // risk control
 if(lossStreak>=3) return;
 if(dailyPnL<=-0.02) return;

 try{
 const prices=await kite.getLTP(STOCKS.map(s=>`NSE:${s}`));
 lastScan=[];
 let best=null,bestScore=0;

 for(let s of STOCKS){
  let p=prices[`NSE:${s}`].last_price;
  let prev=lastPrice[s];

  let signal=getSignal(p,prev);
  let score=prev?Math.abs((p-prev)/prev):0;

  lastScan.push({symbol:s,price:p,signal,score});

  if(signal && score>bestScore){
    bestScore=score;
    best={symbol:s,price:p,signal};
  }

  lastPrice[s]=p;
 }

 // EXIT
 if(activeTrade){
  let p=prices[`NSE:${activeTrade.symbol}`].last_price;
  let pnl=0;

  if(activeTrade.type==="BUY"){
    pnl=(p-activeTrade.entry)/activeTrade.entry;
    if(pnl>=0.01 || pnl<=-0.005){
      await kite.placeOrder("regular",{exchange:"NSE",tradingsymbol:activeTrade.symbol,transaction_type:"SELL",quantity:1,product:"MIS",order_type:"MARKET"});
      dailyPnL+=pnl;
      pnl<0?lossStreak++:lossStreak=0;
      activeTrade=null;
    }
  } else {
    pnl=(activeTrade.entry-p)/activeTrade.entry;
    if(pnl>=0.01 || pnl<=-0.005){
      await kite.placeOrder("regular",{exchange:"NSE",tradingsymbol:activeTrade.symbol,transaction_type:"BUY",quantity:1,product:"MIS",order_type:"MARKET"});
      dailyPnL+=pnl;
      pnl<0?lossStreak++:lossStreak=0;
      activeTrade=null;
    }
  }
  return;
 }

 // ENTRY
 if(best && bestScore>0.0012){
  await kite.placeOrder("regular",{exchange:"NSE",tradingsymbol:best.symbol,transaction_type:best.signal,quantity:1,product:"MIS",order_type:"MARKET"});
  activeTrade={symbol:best.symbol,type:best.signal,entry:best.price};
 }

 }catch(e){}
},3000);

app.get("/",(req,res)=>res.sendFile(path.join(__dirname,"public/index.html")));
app.listen(process.env.PORT||3000);
