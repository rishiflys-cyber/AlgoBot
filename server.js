
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
let cycleCount=0;

const STOCKS=["RELIANCE","TCS","INFY","HDFCBANK","ICICIBANK","SBIN","ITC","LT"];

app.get("/",(req,res)=>{
 res.send(`
 <h2>MONEY MAGNET BOT</h2>
 <button onclick="fetch('/start')">Start</button>
 <button onclick="fetch('/kill')">Kill</button>
 <pre id="d"></pre>
 <script>
 setInterval(async()=>{
  let r=await fetch('/performance');
  let d=await r.json();
  document.getElementById('d').innerText=JSON.stringify(d,null,2);
 },2000);
 </script>
 `);
});

app.get("/login",(req,res)=>res.redirect(kite.getLoginURL()));

app.get("/redirect",async(req,res)=>{
 const s=await kite.generateSession(req.query.request_token,process.env.KITE_API_SECRET);
 access_token=s.access_token;
 kite.setAccessToken(access_token);
 BOT_ACTIVE=true;
 res.send("Login Success");
});

app.get("/start",(req,res)=>{BOT_ACTIVE=true;MANUAL_KILL=false;res.send("STARTED");});
app.get("/kill",(req,res)=>{BOT_ACTIVE=false;MANUAL_KILL=true;res.send("STOPPED");});

async function updateCapital(){
 try{
  let m=await kite.getMargins();
  capital=m?.equity?.available?.live_balance||m?.equity?.available?.cash||m?.equity?.net||0;
 }catch(e){}
}

function prob(a){
 if(a.length<4) return 0;
 let up=0;
 for(let i=1;i<a.length;i++){ if(a[i]>a[i-1]) up++; }
 return up/a.length;
}

setInterval(async()=>{
 if(!access_token||MANUAL_KILL) return;

 try{
  cycleCount++;
  await updateCapital();
  const prices=await kite.getLTP(STOCKS.map(s=>`NSE:${s}`));
  scanData=[];

  for(let s of STOCKS){

    let p=prices[`NSE:${s}`].last_price;

    if(!history[s]) history[s]=[];
    history[s].push(p);
    if(history[s].length>6) history[s].shift();

    let pr=prob(history[s]);

    let signal=null;

    if(pr>=0.45 && history[s].length>=2){
      let l=history[s].at(-1);
      let pr2=history[s].at(-2);
      signal = l>pr2?"BUY":"SELL";
    }

    if(!signal && pr>=0.30 && history[s].length>=2){
      let l=history[s].at(-1);
      let pr2=history[s].at(-2);
      signal = l>pr2?"BUY":"SELL";
    }

    let mode= pr>=0.45?"STRONG":pr>=0.30?"EARLY":"NONE";

    scanData.push({symbol:s,price:p,signal,probability:pr,mode});

    let qty = Math.max(1, Math.floor(capital/(p*20)));

    if(signal && activeTrades.length<3){
      console.log("TRY:",s,signal,qty);

      try{
        await kite.placeOrder("regular",{
          exchange:"NSE",
          tradingsymbol:s,
          transaction_type:signal,
          quantity:qty,
          product:"MIS",
          order_type:"MARKET"
        });

        activeTrades.push({symbol:s,entry:p,type:signal});
      }catch(e){
        console.log("FAIL:",e.message);
      }
    }
  }

  // 🔥 FORCE TRADE IF NONE AFTER SOME TIME
  if(activeTrades.length===0 && cycleCount>10){
    let s=STOCKS[0];
    let p=prices[`NSE:${s}`].last_price;

    console.log("FORCED TRADE:",s);

    try{
      await kite.placeOrder("regular",{
        exchange:"NSE",
        tradingsymbol:s,
        transaction_type:"BUY",
        quantity:1,
        product:"MIS",
        order_type:"MARKET"
      });

      activeTrades.push({symbol:s,entry:p,type:"BUY"});
    }catch(e){}
  }

  pnl=0;
  for(let t of activeTrades){
    let cp=prices[`NSE:${t.symbol}`].last_price;
    pnl += t.type==="BUY"?(cp-t.entry):(t.entry-cp);
  }

 }catch(e){
  console.log("ERR",e.message);
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
