
require("dotenv").config();
const express = require("express");
const axios = require("axios");
const { KiteConnect } = require("kiteconnect");

const app = express();
const kite = new KiteConnect({ api_key: process.env.KITE_API_KEY });

let access_token=null;
let BOT_ACTIVE=false;

let capital=0;
let pnl=0;
let activeTrades=[];
let closedTrades=[];
let history={};
let scanOutput=[];

// 🔥 COMPOUNDING FACTOR
function dynamicQty(price){
  if(!capital) return 1;
  let riskPerTrade = capital * 0.02; // 2% capital
  let qty = Math.max(1, Math.floor(riskPerTrade / price));
  return qty;
}

const STOCKS = ["RELIANCE","TCS","INFY","HDFCBANK","ICICIBANK","SBIN","ITC","LT","AXISBANK","KOTAKBANK"];

app.get("/",(req,res)=>{
 res.send("FINAL COMPUNDING V2 RUNNING");
});

app.get("/login",(req,res)=>res.redirect(kite.getLoginURL()));

app.get("/redirect",async(req,res)=>{
 try{
  const s=await kite.generateSession(req.query.request_token,process.env.KITE_API_SECRET);
  access_token=s.access_token;
  kite.setAccessToken(access_token);
  BOT_ACTIVE=true;

  let ipRes=await axios.get("https://api.ipify.org?format=json");
  res.send("Login Success. IP: "+ipRes.data.ip);

 }catch(e){
  res.send("Login failed");
 }
});

async function updateCapital(){
 try{
  let m=await kite.getMargins();
  capital=m?.equity?.available?.cash||m?.equity?.net||0;
 }catch(e){}
}

function prob(a){
 if(a.length<4) return 0;
 let up=0;
 for(let i=1;i<a.length;i++) if(a[i]>a[i-1]) up++;
 return up/a.length;
}

setInterval(async()=>{
 if(!access_token||!BOT_ACTIVE) return;

 try{
  await updateCapital();
  const prices=await kite.getLTP(STOCKS.map(s=>"NSE:"+s));

  for(let s of STOCKS){
    let p=prices["NSE:"+s]?.last_price;
    if(!p) continue;

    if(!history[s]) history[s]=[];
    history[s].push(p);
    if(history[s].length>6) history[s].shift();

    let pr=prob(history[s]);
    let signal=null;

    if(pr>=0.5) signal = history[s].at(-1)>history[s].at(-2)?"BUY":"SELL";

    if(signal && !activeTrades.find(t=>t.symbol===s) && activeTrades.length<5){

      let qty = dynamicQty(p);

      await kite.placeOrder("regular",{
        exchange:"NSE",
        tradingsymbol:s,
        transaction_type:signal,
        quantity:qty,
        product:"MIS",
        order_type:"MARKET"
      });

      activeTrades.push({symbol:s,entry:p,type:signal,qty});
    }
  }

  let remaining=[];
  let unreal=0;

  for(let t of activeTrades){
    let cp=prices["NSE:"+t.symbol]?.last_price;
    if(!cp) continue;

    let profit=t.type==="BUY"?(cp-t.entry):(t.entry-cp);

    if(profit > t.entry*0.003 || profit < -t.entry*0.002){
      await kite.placeOrder("regular",{
        exchange:"NSE",
        tradingsymbol:t.symbol,
        transaction_type: t.type==="BUY"?"SELL":"BUY",
        quantity:t.qty,
        product:"MIS",
        order_type:"MARKET"
      });

      closedTrades.push(profit*t.qty);
    } else {
      unreal += profit*t.qty;
      remaining.push(t);
    }
  }

  activeTrades=remaining;

  let realized = closedTrades.reduce((a,b)=>a+b,0);
  pnl = realized + unreal;

 }catch(e){}
},3000);

app.get("/performance",(req,res)=>{
 res.json({capital,pnl,activeTradesCount:activeTrades.length});
});

app.listen(process.env.PORT||3000);
