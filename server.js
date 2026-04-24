
require("dotenv").config();
const express = require("express");
const { KiteConnect } = require("kiteconnect");

const { unifiedSignal } = require("./strategy_unified");
const { confirmSignal } = require("./signal_confirmation");
const { getPositionSize } = require("./position_sizing");

const CONFIG = require("./config/config");

const app = express();
const kite = new KiteConnect({ api_key: process.env.KITE_API_KEY });

let access_token = null;
let MANUAL_KILL = false;
let BOT_ACTIVE = false;

let capital = 0;
let activeTrades = [];
let lastPrice = {};
let history = {};
let scanData = [];

app.get("/login",(req,res)=>res.redirect(kite.getLoginURL()));

app.get("/redirect",async(req,res)=>{
 try{
  const s=await kite.generateSession(req.query.request_token,process.env.KITE_API_SECRET);
  access_token=s.access_token;
  kite.setAccessToken(access_token);
  BOT_ACTIVE=true;
  res.send("Login Success");
 }catch(e){res.send(e.message);}
});

app.get("/start",(req,res)=>{MANUAL_KILL=false;BOT_ACTIVE=true;res.send("STARTED");});
app.get("/kill",(req,res)=>{MANUAL_KILL=true;BOT_ACTIVE=false;res.send("STOPPED");});

async function syncCapital(){
 try{
  const m=await kite.getMargins();
  const cash=m?.equity?.available?.live_balance||m?.equity?.available?.cash||m?.equity?.net||0;
  if(cash>0) capital=cash;
 }catch(e){}
}

function probability(arr){
 if(!arr||arr.length<4) return 0;
 let up=0;
 for(let i=1;i<arr.length;i++){
  if(arr[i]>arr[i-1]) up++;
 }
 return up/arr.length;
}

setInterval(async()=>{
 if(!access_token || MANUAL_KILL) return;

 try{
  await syncCapital();
  const prices=await kite.getLTP(CONFIG.STOCKS.map(s=>`NSE:${s}`));
  scanData=[];

  for(let s of CONFIG.STOCKS){

    let p=prices[`NSE:${s}`].last_price;

    if(!history[s]) history[s]=[];
    history[s].push(p);
    if(history[s].length>6) history[s].shift();

    let raw=unifiedSignal(p,lastPrice[s],s);
    let confirmed=confirmSignal(s,raw);
    let prob=probability(history[s]);

    let signal = confirmed || raw;

    if (!signal && prob >= 0.45 && history[s].length >= 2) {
        let last = history[s][history[s].length - 1];
        let prev = history[s][history[s].length - 2];
        if (last > prev) signal = "BUY";
        else if (last < prev) signal = "SELL";
    }

    let mode="NONE";
    let sizeFactor=0;

    if(prob>=0.45){mode="STRONG"; sizeFactor=1;}
    else if(prob>=0.40){mode="EARLY"; sizeFactor=0.5;}

    lastPrice[s]=p;

    scanData.push({symbol:s,price:p,signal,probability:prob,mode});

    if(sizeFactor===0) continue;

    if(signal && activeTrades.length<CONFIG.MAX_TRADES){

        let baseQty=getPositionSize(capital,p,CONFIG);
        let qty=Math.floor(baseQty*sizeFactor);

        if(qty<=0) continue;

        try{
          let order=await kite.placeOrder("regular",{
            exchange:"NSE",
            tradingsymbol:s,
            transaction_type:signal,
            quantity:qty,
            product:"MIS",
            order_type:"MARKET"
          });

          activeTrades.push({symbol:s,type:signal,entry:p,qty});

        }catch(err){}
    }
  }

 }catch(e){}

},3000);

app.get("/performance",(req,res)=>{
 res.json({
  capital,
  botActive: BOT_ACTIVE && !MANUAL_KILL,
  activeTradesCount:activeTrades.length,
  scan:scanData
 });
});

app.listen(process.env.PORT||3000);
