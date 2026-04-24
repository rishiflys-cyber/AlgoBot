
require("dotenv").config();
const express = require("express");
const { KiteConnect } = require("kiteconnect");

const app = express();
const kite = new KiteConnect({ api_key: process.env.KITE_API_KEY });

let access_token=null;
let BOT_ACTIVE=false;
let MANUAL_KILL=false;

let capital=0;
let pnl=0;
let activeTrades=[];
let history={};
let scanData=[];

const STOCKS=["RELIANCE","TCS","INFY","HDFCBANK","ICICIBANK","SBIN","ITC","LT","AXISBANK","KOTAKBANK"];

app.get("/",(req,res)=>{
 res.send(`
 <h2>FINAL BOT DASHBOARD</h2>
 <button onclick="fetch('/start')">Start</button>
 <button onclick="fetch('/kill')">Kill</button>
 <pre id="data"></pre>
 <script>
 setInterval(async()=>{
  let r=await fetch('/performance');
  let d=await r.json();
  document.getElementById('data').innerText=JSON.stringify(d,null,2);
 },2000);
 </script>
 `);
});

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

async function updateCapital(){
 try{
  let m=await kite.getMargins();
  capital=m?.equity?.available?.live_balance||m?.equity?.available?.cash||m?.equity?.net||0;
 }catch(e){}
}

function probability(arr){
 if(arr.length<4) return 0;
 let up=0;
 for(let i=1;i<arr.length;i++){
  if(arr[i]>arr[i-1]) up++;
 }
 return up/arr.length;
}

setInterval(async()=>{
 if(!access_token||MANUAL_KILL) return;

 try{
  await updateCapital();
  const prices=await kite.getLTP(STOCKS.map(s=>`NSE:${s}`));
  scanData=[];

  for(let s of STOCKS){
    let p=prices[`NSE:${s}`].last_price;

    if(!history[s]) history[s]=[];
    history[s].push(p);
    if(history[s].length>6) history[s].shift();

    let prob=probability(history[s]);

    let signal=null;

    if(prob>=0.45 && history[s].length>=2){
      let last=history[s].at(-1);
      let prev=history[s].at(-2);
      signal= last>prev ? "BUY":"SELL";
    }

    if(!signal && prob>=0.30 && history[s].length>=2){
      let last=history[s].at(-1);
      let prev=history[s].at(-2);
      signal= last>prev ? "BUY":"SELL";
    }

    let mode= prob>=0.45?"STRONG":prob>=0.30?"EARLY":"NONE";

    scanData.push({symbol:s,price:p,signal,probability:prob,mode});

    console.log("EXEC:",s,signal,prob);

    if(signal && activeTrades.length<3){
      try{
        await kite.placeOrder("regular",{
          exchange:"NSE",
          tradingsymbol:s,
          transaction_type:signal,
          quantity:1,
          product:"MIS",
          order_type:"MARKET"
        });

        activeTrades.push({symbol:s,entry:p,type:signal});
      }catch(e){
        console.log("ORDER FAIL",e.message);
      }
    }
  }

  pnl=0;
  for(let t of activeTrades){
    let current=prices[`NSE:${t.symbol}`].last_price;
    pnl += t.type==="BUY" ? (current-t.entry):(t.entry-current);
  }

 }catch(e){
  console.log("LOOP ERR",e.message);
 }

},3000);

app.get("/performance",(req,res)=>{
 res.json({
  capital,
  pnl,
  botActive: BOT_ACTIVE && !MANUAL_KILL,
  activeTradesCount: activeTrades.length,
  scan: scanData
 });
});

app.listen(process.env.PORT||3000);
