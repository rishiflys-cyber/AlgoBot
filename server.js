
require("dotenv").config();
const express = require("express");
const { KiteConnect } = require("kiteconnect");

const app = express();
const kite = new KiteConnect({ api_key: process.env.KITE_API_KEY });

let access_token = null;
let BOT_ACTIVE = false;
let MANUAL_KILL = false;

let capital = 0;
let activeTrades = [];
let history = {};
let lastPrice = {};
let scanData = [];

const STOCKS = ["RELIANCE","TCS","INFY","HDFCBANK","ICICIBANK","SBIN","ITC","LT","AXISBANK","KOTAKBANK"];

app.get("/", (req,res)=>{
 res.send(`
 <h2>FINAL BOT LIVE</h2>
 <button onclick="fetch('/start')">Start</button>
 <button onclick="fetch('/kill')">Kill</button>
 <pre id="d"></pre>
 <script>
 setInterval(async()=>{
  let r = await fetch('/performance');
  let d = await r.json();
  document.getElementById('d').innerText = JSON.stringify(d,null,2);
 },2000);
 </script>
 `);
});

app.get("/login",(req,res)=>res.redirect(kite.getLoginURL()));

app.get("/redirect", async (req,res)=>{
 try{
  const s = await kite.generateSession(req.query.request_token, process.env.KITE_API_SECRET);
  access_token = s.access_token;
  kite.setAccessToken(access_token);
  BOT_ACTIVE = true;
  res.send("Login Success");
 }catch(e){ res.send(e.message); }
});

app.get("/start",(req,res)=>{
 BOT_ACTIVE=true;
 MANUAL_KILL=false;
 res.send("STARTED");
});

app.get("/kill",(req,res)=>{
 BOT_ACTIVE=false;
 MANUAL_KILL=true;
 res.send("STOPPED");
});

function probability(arr){
 if(arr.length < 4) return 0;
 let up=0;
 for(let i=1;i<arr.length;i++){
  if(arr[i]>arr[i-1]) up++;
 }
 return up/arr.length;
}

setInterval(async()=>{
 if(!access_token || MANUAL_KILL) return;

 try{
  const prices = await kite.getLTP(STOCKS.map(s=>`NSE:${s}`));
  scanData=[];

  for(let s of STOCKS){

    let p = prices[`NSE:${s}`].last_price;

    if(!history[s]) history[s]=[];
    history[s].push(p);
    if(history[s].length>6) history[s].shift();

    let prob = probability(history[s]);

    let signal = null;
    if(prob>=0.45 && history[s].length>=2){
      let last = history[s].at(-1);
      let prev = history[s].at(-2);
      if(last>prev) signal="BUY";
      else if(last<prev) signal="SELL";
    }

    let mode="NONE";
    if(prob>=0.45) mode="STRONG";
    else if(prob>=0.40) mode="EARLY";

    scanData.push({symbol:s,price:p,signal,probability:prob,mode});

    console.log("CHECK", s, signal, prob);

    if(signal && activeTrades.length<5){
      console.log("TRY ORDER", s, signal);
      try{
        await kite.placeOrder("regular",{
          exchange:"NSE",
          tradingsymbol:s,
          transaction_type:signal,
          quantity:1,
          product:"MIS",
          order_type:"MARKET"
        });
        activeTrades.push({s,signal});
      }catch(e){
        console.log("ORDER FAILED", e.message);
      }
    }
  }

 }catch(e){ console.log("ERROR", e.message); }

},3000);

app.get("/performance",(req,res)=>{
 res.json({
  botActive: BOT_ACTIVE && !MANUAL_KILL,
  activeTradesCount: activeTrades.length,
  scan: scanData
 });
});

app.listen(process.env.PORT||3000);
