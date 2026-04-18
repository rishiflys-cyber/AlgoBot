
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

// ===== RESEARCH DATA STORAGE =====
let tradeLog = [];
let metrics = { total:0, win:0, loss:0, pnl:0 };

// persist logs
function saveLogs(){
    fs.writeFileSync("trade_log.json", JSON.stringify(tradeLog,null,2));
}

// ===== BASIC LOGIC (UNCHANGED CORE + ADDITIONS) =====
function getQty(price){
    let risk = capital*0.01;
    return Math.max(1, Math.floor(risk/price));
}

function updateMetrics(pnl){
    metrics.total++;
    metrics.pnl += pnl;
    if(pnl>0) metrics.win++; else metrics.loss++;
}

// ===== ADVANCED ANALYTICS (NEW) =====
function getSharpe(){
    if(metrics.total < 5) return 0;
    let avg = metrics.pnl/metrics.total;
    return avg * Math.sqrt(metrics.total);
}

function getWinRate(){
    if(metrics.total===0) return 0;
    return metrics.win/metrics.total;
}

// ===== ADAPTIVE ENGINE =====
let threshold = 0.0012;

function adapt(){
    let winRate = getWinRate();
    if(winRate < 0.4) threshold += 0.0002;
    if(winRate > 0.6) threshold -= 0.0001;
    if(threshold<0.0008) threshold=0.0008;
    if(threshold>0.002) threshold=0.002;
}

// ===== LOOP =====
const STOCKS=["RELIANCE","HDFCBANK","ICICIBANK","INFY","TCS"];

setInterval(async ()=>{
 if(!BOT_ACTIVE || !access_token) return;

 try{
  const prices=await kite.getLTP(STOCKS.map(s=>`NSE:${s}`));

  for(let s of STOCKS){
    let p=prices[`NSE:${s}`].last_price;
    let prev=lastPrice[s];

    let signal=null;
    if(prev){
        let change=(p-prev)/prev;
        if(Math.abs(change)>threshold){
            signal = change>0?"BUY":"SELL";
        }
    }

    lastScan.push({s,p,signal,threshold});

    if(signal && activeTrades.length<2){
        let qty=getQty(p);
        await kite.placeOrder("regular",{
            exchange:"NSE",
            tradingsymbol:s,
            transaction_type:signal,
            quantity:qty,
            product:"MIS",
            order_type:"MARKET"
        });
        activeTrades.push({s,entry:p,type:signal,qty});
    }

    lastPrice[s]=p;
  }

  // exits
  let newTrades=[];
  for(let t of activeTrades){
    let p=prices[`NSE:${t.s}`].last_price;
    let pnl = t.type==="BUY" ? (p-t.entry)/t.entry : (t.entry-p)/t.entry;

    if(pnl>0.015 || pnl<-0.005){
        await kite.placeOrder("regular",{
            exchange:"NSE",
            tradingsymbol:t.s,
            transaction_type:t.type==="BUY"?"SELL":"BUY",
            quantity:t.qty,
            product:"MIS",
            order_type:"MARKET"
        });

        capital += capital*pnl;
        updateMetrics(pnl);

        tradeLog.push({...t,exit:p,pnl});
        saveLogs();

        adapt();
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
app.get("/status",(req,res)=>res.json({scan:lastScan,metrics,sharpe:getSharpe()}));

app.listen(process.env.PORT||3000);
