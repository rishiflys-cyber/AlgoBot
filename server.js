
require("dotenv").config();
const express=require("express");
const path=require("path");
const {KiteConnect}=require("kiteconnect");

const app=express();
app.use(express.json());
app.use(express.static(path.join(__dirname,"public")));

const kite=new KiteConnect({api_key:process.env.KITE_API_KEY});

let access_token=null,BOT_ACTIVE=false;
let capital=0,tradesToday=0;
let activeTrade=null;
let tradeLog=[];
let lastScan=[];
let lossStreak=0,dailyPnL=0;

const STOCKS=["RELIANCE","HDFCBANK","ICICIBANK","INFY","TCS","SBIN","ITC","LT","AXISBANK","KOTAKBANK"];

const CONFIG={
 MAX_TRADES:3,
 SL:0.01,
 TP:0.02,
 RISK:0.01,
 BASE_SCORE:0.0015,
 MAX_DD:-0.025,
 MAX_LOSS_STREAK:3
};

app.get("/login",(req,res)=>res.redirect(kite.getLoginURL()));

app.get("/redirect",async(req,res)=>{
 try{
  const s=await kite.generateSession(req.query.request_token,process.env.KITE_API_SECRET);
  access_token=s.access_token;
  kite.setAccessToken(access_token);
  res.send("Login Success");
 }catch{res.send("Login Failed")}
});

app.get("/start",(req,res)=>{BOT_ACTIVE=true;res.send("STARTED")});
app.get("/kill",(req,res)=>{BOT_ACTIVE=false;res.send("STOPPED")});

app.get("/dashboard",(req,res)=>{
 res.json({BOT_ACTIVE,tradesToday,activeTrade,lossStreak,dailyPnL});
});

app.get("/status",(req,res)=>res.json(lastScan));

function isMarketTime(){
 let now=new Date();
 let t=now.getHours()*60+now.getMinutes();
 return t>=560 && t<=885;
}

function score(p,prev){
 if(!prev) return 0;
 return Math.abs((p-prev)/prev);
}

function momentum(p,prev){
 if(!prev) return null;
 let c=(p-prev)/prev;
 if(c>0.002) return "BUY";
 if(c<-0.002) return "SELL";
 return null;
}

function meanRev(p,prev){
 if(!prev) return null;
 let c=(p-prev)/prev;
 if(c<-0.003) return "BUY";
 if(c>0.003) return "SELL";
 return null;
}

function qty(price){
 let risk=capital*CONFIG.RISK;
 let sl=price*CONFIG.SL;
 return Math.max(1,Math.floor(risk/sl));
}

let last={};

setInterval(async()=>{
 if(!BOT_ACTIVE||!access_token) return;
 if(!isMarketTime()) return;
 if(dailyPnL<=CONFIG.MAX_DD*capital) return;
 if(lossStreak>=CONFIG.MAX_LOSS_STREAK) return;

 const prices=await kite.getLTP(STOCKS.map(s=>`NSE:${s}`));
 if(!prices) return;

 lastScan=[];
 let best=null,bestScore=0;

 for(let s of STOCKS){
  let p=prices[`NSE:${s}`].last_price;
  let prev=last[s];

  let sig=momentum(p,prev)||meanRev(p,prev);
  let sc=score(p,prev);

  let decision="SKIP";
  if(sc>CONFIG.BASE_SCORE && sig) decision="READY";

  lastScan.push({symbol:s,price:p,score:sc,signal:sig,decision});

  if(sc>bestScore){
    bestScore=sc;
    best={symbol:s,price:p,prev,signal:sig};
  }

  last[s]=p;
 }

 if(activeTrade){
  let p=prices[`NSE:${activeTrade.symbol}`].last_price;
  let exit=false,pnl=0;

  if(activeTrade.type==="BUY"){
    if(p<=activeTrade.entry*(1-CONFIG.SL) || p>=activeTrade.entry*(1+CONFIG.TP)) exit=true;
    pnl=(p-activeTrade.entry)*activeTrade.qty;
  } else {
    if(p>=activeTrade.entry*(1+CONFIG.SL) || p<=activeTrade.entry*(1-CONFIG.TP)) exit=true;
    pnl=(activeTrade.entry-p)*activeTrade.qty;
  }

  if(exit){
    await kite.placeOrder("regular",{
      exchange:"NSE",
      tradingsymbol:activeTrade.symbol,
      transaction_type:activeTrade.type==="BUY"?"SELL":"BUY",
      quantity:activeTrade.qty,
      product:"MIS",
      order_type:"MARKET"
    });

    dailyPnL+=pnl;
    if(pnl<0) lossStreak++; else lossStreak=0;
    activeTrade=null;
  }
  return;
 }

 if(tradesToday>=CONFIG.MAX_TRADES) return;
 if(!best||!best.signal) return;

 let q=qty(best.price);

 await kite.placeOrder("regular",{
  exchange:"NSE",
  tradingsymbol:best.symbol,
  transaction_type:best.signal,
  quantity:q,
  product:"MIS",
  order_type:"LIMIT",
  price:best.signal==="BUY"?best.price*1.001:best.price*0.999
 });

 activeTrade={symbol:best.symbol,type:best.signal,entry:best.price,qty:q};
 tradesToday++;

},3000);

const PORT=process.env.PORT||3000;
app.listen(PORT,()=>console.log("FINAL 9.2 BOT RUNNING"));
