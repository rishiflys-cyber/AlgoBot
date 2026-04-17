
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
let tradeHistory=[];
let lastScan=[];
let lossStreak=0,dailyPnL=0;

const STOCKS=["RELIANCE","HDFCBANK","ICICIBANK","INFY","TCS","SBIN","ITC","LT","AXISBANK","KOTAKBANK"];
const CONFIG={
 MAX_TRADES:3,
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

// ===== STRATEGIES =====
function momentum(p,prev){
 if(!prev) return null;
 let c=(p-prev)/prev;
 if(c>0.002) return "BUY";
 if(c<-0.002) return "SELL";
 return null;
}

function meanReversion(p,prev){
 if(!prev) return null;
 let c=(p-prev)/prev;
 if(c<-0.003) return "BUY";
 if(c>0.003) return "SELL";
 return null;
}

function score(p,prev){
 if(!prev) return 0;
 return Math.abs((p-prev)/prev);
}

function adaptiveThreshold(){
 if(lossStreak>=2) return CONFIG.BASE_SCORE*1.3;
 if(tradeHistory.slice(-5).filter(t=>t.pnl>0).length>=3) return CONFIG.BASE_SCORE*0.9;
 return CONFIG.BASE_SCORE;
}

let last={};

setInterval(async()=>{
 if(!BOT_ACTIVE||!access_token) return;
 if(lossStreak>=CONFIG.MAX_LOSS_STREAK) return;

 const prices=await kite.getLTP(STOCKS.map(s=>`NSE:${s}`));
 if(!prices) return;

 lastScan=[];
 let best=null,bestScore=0;

 for(let s of STOCKS){
  let p=prices[`NSE:${s}`].last_price;
  let prev=last[s];

  let sig1=momentum(p,prev);
  let sig2=meanReversion(p,prev);

  let finalSignal=sig1||sig2;
  let sc=score(p,prev);

  let decision="SKIP";
  if(sc>adaptiveThreshold() && finalSignal) decision="READY";

  lastScan.push({symbol:s,price:p,score:sc,signal:finalSignal,decision});

  if(sc>bestScore){
    bestScore=sc;
    best={symbol:s,price:p,prev,signal:finalSignal};
  }

  last[s]=p;
 }

 if(activeTrade) return;
 if(!best||!best.signal) return;

 await kite.placeOrder("regular",{
  exchange:"NSE",
  tradingsymbol:best.symbol,
  transaction_type:best.signal,
  quantity:1,
  product:"MIS",
  order_type:"MARKET"
 });

 activeTrade={symbol:best.symbol,type:best.signal,entry:best.price};

 tradesToday++;

},3000);

const PORT=process.env.PORT||3000;
app.listen(PORT,()=>console.log("INSTITUTIONAL BOT RUNNING"));
