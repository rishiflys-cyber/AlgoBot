
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
 <h2>FINAL ADAPTIVE BOT (AUTO THRESHOLD)</h2>
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

function volatility(a){
 if(a.length<4) return 0;
 let sum=0;
 for(let i=1;i<a.length;i++){
  sum += Math.abs(a[i]-a[i-1]);
 }
 return sum/a.length;
}

setInterval(async()=>{
 if(!access_token || MANUAL_KILL) return;

 try{
  await updateCapital();
  const prices=await kite.getLTP(STOCKS.map(s=>`NSE:${s}`));
  scanData=[];

  for(let s of STOCKS){

    let p=prices[`NSE:${s}`]?.last_price;
    if(!p) continue;

    if(!history[s]) history[s]=[];
    history[s].push(p);
    if(history[s].length>8) history[s].shift();

    let pr=prob(history[s]);
    let vol=volatility(history[s]);

    // 🔥 ADAPTIVE THRESHOLD
    let dynamicThreshold = vol > 2 ? 0.35 : 0.3;

    let signal=null;
    let mode="NONE";

    if(pr>=0.5){
      signal = history[s].at(-1) > history[s].at(-2) ? "BUY":"SELL";
      mode="CORE";
    }
    else if(pr>=dynamicThreshold){
      signal = history[s].at(-1) > history[s].at(-2) ? "BUY":"SELL";
      mode="SCOUT";
    }

    scanData.push({symbol:s,price:p,signal,probability:pr,mode,threshold:dynamicThreshold});

    if(signal && activeTrades.length<3){

      let baseQty=Math.max(1,Math.floor(capital/(p*25)));
      let qty = mode==="CORE" ? baseQty : Math.max(1,Math.floor(baseQty*0.4));

      try{
        console.log("TRY ENTRY:", s, signal, qty, mode);

        await kite.placeOrder("regular",{
            exchange:"NSE",
            tradingsymbol:s,
            transaction_type:signal,
            quantity:qty,
            product:"MIS",
            order_type:"MARKET",
            market_protection:2
        });

        activeTrades.push({symbol:s,entry:p,type:signal,qty});

      }catch(e){
        console.log("ENTRY FAILED:", e.message);
      }
    }
  }

  // EXIT
  let remaining=[];
  for(let t of activeTrades){
    let cp=prices[`NSE:${t.symbol}`]?.last_price;
    if(!cp) continue;

    let profit = t.type==="BUY"?(cp-t.entry):(t.entry-cp);

    if(profit > t.entry*0.0035 || profit < -t.entry*0.002){
        await kite.placeOrder("regular",{
            exchange:"NSE",
            tradingsymbol:t.symbol,
            transaction_type: t.type==="BUY"?"SELL":"BUY",
            quantity:t.qty,
            product:"MIS",
            order_type:"MARKET",
            market_protection:2
        });
    } else {
        remaining.push(t);
    }
  }

  activeTrades = remaining;

 }catch(e){
  console.log("LOOP ERROR:", e.message);
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
