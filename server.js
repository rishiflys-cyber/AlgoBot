
require("dotenv").config();
const express = require("express");
const path = require("path");
const fs = require("fs");
const { KiteConnect } = require("kiteconnect");

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const kite = new KiteConnect({ api_key: process.env.KITE_API_KEY });

// ===== EXISTING STATE (UNCHANGED) =====
let access_token=null, BOT_ACTIVE=false;
let activeTrades=[], lastPrice={}, lastScan=[];
let capital=100000, lossStreak=0, dailyPnL=0;

// ===== BACKTEST ENGINE (NEW ADDITION) =====
let backtestResults = [];

function runBacktest(data){
    let trades = [];
    let cap = 100000;

    for(let i=1;i<data.length;i++){
        let prev = data[i-1];
        let curr = data[i];

        let change = (curr - prev) / prev;

        if(Math.abs(change) > 0.001){
            let type = change > 0 ? "BUY" : "SELL";
            let entry = prev;
            let exit = curr;

            let pnl = type==="BUY" ? (exit-entry)/entry : (entry-exit)/entry;

            cap += cap * pnl;

            trades.push({type,entry,exit,pnl});
        }
    }

    return {
        trades,
        finalCapital: cap,
        totalTrades: trades.length
    };
}

// ===== LOAD HISTORICAL SAMPLE (simple JSON file) =====
app.post("/backtest", (req,res)=>{
    try{
        let prices = req.body.prices; // array expected
        let result = runBacktest(prices);
        backtestResults = result;
        res.json(result);
    }catch(e){
        res.send("Backtest error");
    }
});

// ===== EXISTING LOGIC (KEPT SAME) =====
function getQty(price){
    let risk = capital * 0.01;
    return Math.max(1, Math.floor(risk/price));
}

const STOCKS=["RELIANCE","HDFCBANK","ICICIBANK","INFY","TCS"];

setInterval(async ()=>{
 if(!BOT_ACTIVE || !access_token) return;

 try{
  const prices=await kite.getLTP(STOCKS.map(s=>`NSE:${s}`));
  lastScan=[];

  for(let s of STOCKS){
    let p=prices[`NSE:${s}`].last_price;
    let prev=lastPrice[s];

    let signal=null;
    if(prev){
        let change=(p-prev)/prev;
        if(Math.abs(change)>0.0012){
            signal = change>0?"BUY":"SELL";
        }
    }

    lastScan.push({symbol:s,price:p,signal});

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

        activeTrades.push({symbol:s,type:signal,entry:p,qty});
    }

    lastPrice[s]=p;
  }

  // EXIT
  let newTrades=[];
  for(let t of activeTrades){
    let p=prices[`NSE:${t.symbol}`].last_price;
    let pnl = t.type==="BUY" ? (p-t.entry)/t.entry : (t.entry-p)/t.entry;

    if(pnl > 0.015 || pnl < -0.005){
        await kite.placeOrder("regular",{
            exchange:"NSE",
            tradingsymbol:t.symbol,
            transaction_type:t.type==="BUY"?"SELL":"BUY",
            quantity:t.qty,
            product:"MIS",
            order_type:"MARKET"
        });

        capital += capital*pnl;
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
app.get("/status",(req,res)=>res.json({scan:lastScan,capital,backtest:backtestResults}));

app.listen(process.env.PORT||3000);
