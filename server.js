
require("dotenv").config();
const express = require("express");
const path = require("path");
const { KiteConnect } = require("kiteconnect");

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const kite = new KiteConnect({ api_key: process.env.KITE_API_KEY });

let access_token=null, BOT_ACTIVE=false;
let trades=[], lastScan=[], lastPrice={};

const STOCKS=["RELIANCE","HDFCBANK","ICICIBANK","INFY","TCS"];

function getIST(){
 const now=new Date();
 return new Date(now.toLocaleString("en-US",{timeZone:"Asia/Kolkata"}));
}
function mins(){
 let t=getIST();
 return t.getHours()*60+t.getMinutes();
}

setInterval(()=>{
 let m=mins();
 if(m===560) BOT_ACTIVE=true;
 if(m===930) BOT_ACTIVE=false;
},60000);

app.get("/login",(req,res)=>res.redirect(kite.getLoginURL()));
app.get("/redirect",async(req,res)=>{
 const s=await kite.generateSession(req.query.request_token,process.env.KITE_API_SECRET);
 access_token=s.access_token;
 kite.setAccessToken(access_token);
 res.send("OK");
});

app.get("/start",(req,res)=>{BOT_ACTIVE=true;res.send("STARTED")});
app.get("/kill",(req,res)=>{BOT_ACTIVE=false;res.send("STOPPED")});
app.get("/status",(req,res)=>res.json(lastScan));

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
 if(avg>0.0005) return "BULL";
 if(avg<-0.0005) return "BEAR";
 return "SIDEWAYS";
}

function momentumSignal(p,prev){
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

setInterval(async()=>{
 if(!BOT_ACTIVE||!access_token) return;

 const prices=await kite.getLTP(STOCKS.map(s=>`NSE:${s}`));
 let bias=getMarketBias(prices);
 lastScan=[];

 for(let s of STOCKS){
  let p=prices[`NSE:${s}`].last_price;
  let prev=lastPrice[s];

  let sig1=momentumSignal(p,prev);
  let sig2=meanReversion(p,prev);

  let finalSignal=sig1||sig2;

  lastScan.push({symbol:s,price:p,signal:finalSignal,bias});

  if(finalSignal && trades.length<2){
   if((bias==="BULL" && finalSignal==="BUY")||(bias==="BEAR" && finalSignal==="SELL")){
    await kite.placeOrder("regular",{
      exchange:"NSE",
      tradingsymbol:s,
      transaction_type:finalSignal,
      quantity:1,
      product:"MIS",
      order_type:"MARKET"
    });

    trades.push({symbol:s,type:finalSignal,entry:p});
   }
  }

  lastPrice[s]=p;
 }

 // exit all trades simple
 for(let t of trades){
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
  }
 }

 trades=[];
},3000);

app.get("/",(req,res)=>res.sendFile(path.join(__dirname,"public/index.html")));
app.listen(process.env.PORT||3000);
