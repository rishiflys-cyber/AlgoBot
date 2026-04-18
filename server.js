
require("dotenv").config();
const express = require("express");
const path = require("path");
const fs = require("fs");
const { KiteConnect } = require("kiteconnect");

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const kite = new KiteConnect({ api_key: process.env.KITE_API_KEY });

let access_token=null, BOT_ACTIVE=false;
let activeTrades=[], lastPrice={}, lastScan=[];
let capital=100000, lossStreak=0, dailyPnL=0;

// ===== DATA SCIENCE LAYER =====
let tradeLog = [];
let featureStore = {};   // stores features per stock
let modelWeights = {};   // adaptive weighting

function saveLogs(){
    fs.writeFileSync("trade_log.json", JSON.stringify(tradeLog,null,2));
}

// ===== FEATURE ENGINEERING =====
function updateFeatures(symbol, price){
    if(!featureStore[symbol]) featureStore[symbol]=[];

    featureStore[symbol].push(price);
    if(featureStore[symbol].length > 30){
        featureStore[symbol].shift();
    }
}

function getFeatures(symbol){
    let arr = featureStore[symbol];
    if(!arr || arr.length < 5) return null;

    let mean = arr.reduce((a,b)=>a+b,0)/arr.length;
    let variance = arr.reduce((a,b)=>a+(b-mean)**2,0)/arr.length;
    let std = Math.sqrt(variance);

    let momentum = (arr[arr.length-1] - arr[0]) / arr[0];

    return {mean, std, momentum};
}

// ===== SIMPLE MODEL (SCORING) =====
function getScore(symbol, price){
    let f = getFeatures(symbol);
    if(!f) return 0;

    let z = f.std === 0 ? 0 : (price - f.mean) / f.std;
    let score = z + f.momentum;

    return score;
}

// ===== ADAPTIVE WEIGHTING =====
function updateWeights(symbol, pnl){
    if(!modelWeights[symbol]) modelWeights[symbol]=1;

    if(pnl > 0) modelWeights[symbol] += 0.1;
    else modelWeights[symbol] -= 0.1;

    if(modelWeights[symbol] < 0.5) modelWeights[symbol] = 0.5;
    if(modelWeights[symbol] > 2) modelWeights[symbol] = 2;
}

// ===== POSITION SIZING =====
function getQty(price, symbol){
    let base = capital * 0.01;
    let weight = modelWeights[symbol] || 1;
    return Math.max(1, Math.floor((base * weight) / price));
}

// ===== LOOP =====
const STOCKS=["RELIANCE","HDFCBANK","ICICIBANK","INFY","TCS"];

setInterval(async ()=>{
 if(!BOT_ACTIVE || !access_token) return;

 try{
  const prices = await kite.getLTP(STOCKS.map(s=>`NSE:${s}`));
  lastScan=[];

  for(let s of STOCKS){
    let p = prices[`NSE:${s}`].last_price;

    updateFeatures(s,p);
    let score = getScore(s,p);

    let signal=null;
    if(score > 1) signal="BUY";
    if(score < -1) signal="SELL";

    lastScan.push({symbol:s,price:p,score,signal,weight:modelWeights[s]});

    if(signal && activeTrades.length < 2){
        let qty = getQty(p,s);

        await kite.placeOrder("regular",{
            exchange:"NSE",
            tradingsymbol:s,
            transaction_type:signal,
            quantity:qty,
            product:"MIS",
            order_type:"MARKET"
        });

        activeTrades.push({symbol:s,type:signal,entry:p,qty});
    }

    lastPrice[s]=p;
  }

  // EXIT
  let newTrades=[];
  for(let t of activeTrades){
    let p = prices[`NSE:${t.symbol}`].last_price;
    let pnl = t.type==="BUY" ? (p-t.entry)/t.entry : (t.entry-p)/t.entry;

    if(pnl > 0.02 || pnl < -0.005){
        await kite.placeOrder("regular",{
            exchange:"NSE",
            tradingsymbol:t.symbol,
            transaction_type:t.type==="BUY"?"SELL":"BUY",
            quantity:t.qty,
            product:"MIS",
            order_type:"MARKET"
        });

        capital += capital * pnl;
        updateWeights(t.symbol, pnl);

        tradeLog.push({...t,exit:p,pnl});
        saveLogs();
    } else {
        newTrades.push(t);
    }
  }
  activeTrades=newTrades;

 }catch(e){}

},3000);

// ===== CONTROL =====
app.get("/start",(req,res)=>{BOT_ACTIVE=true;res.send("STARTED")});
app.get("/kill",(req,res)=>{BOT_ACTIVE=false;res.send("STOPPED")});
app.get("/status",(req,res)=>res.json({scan:lastScan,capital,weights:modelWeights}));

app.listen(process.env.PORT||3000);
