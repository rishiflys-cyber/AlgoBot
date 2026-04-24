
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
let volumeHistory={};
let scanOutput=[];
let serverIP="UNKNOWN";

// GET SERVER IP
async function updateIP(){
 try{
  let res = await axios.get("https://api.ipify.org?format=json");
  serverIP = res.data.ip;
 }catch(e){}
}

// CAPITAL
async function updateCapital(){
 try{
  let m=await kite.getMargins();
  capital=m?.equity?.available?.cash||m?.equity?.net||0;
 }catch(e){}
}

// PROBABILITY
function prob(a){
 if(a.length<4) return 0;
 let up=0;
 for(let i=1;i<a.length;i++) if(a[i]>a[i-1]) up++;
 return up/a.length;
}

// INDEX TREND
let indexHistory=[];
function getIndexTrend(){
 if(indexHistory.length<5) return "UNKNOWN";
 let up=0;
 for(let i=1;i<indexHistory.length;i++){
  if(indexHistory[i]>indexHistory[i-1]) up++;
 }
 return up>=3?"UP":"DOWN";
}

// VOLUME BREAKOUT
function volumeBreakout(symbol, vol){
 if(!volumeHistory[symbol]) return false;
 let avg = volumeHistory[symbol].reduce((a,b)=>a+b,0)/volumeHistory[symbol].length;
 return vol > avg * 1.5;
}

// DYNAMIC CAPITAL ALLOCATION
function dynamicQty(price, confidence){
 if(!capital) return 1;
 let risk = capital * (confidence >=0.6 ? 0.05 : 0.02);
 return Math.max(1, Math.floor(risk/price));
}

const STOCKS = ["RELIANCE","TCS","INFY","HDFCBANK","ICICIBANK","SBIN","ITC","LT","AXISBANK","KOTAKBANK"];

// DASHBOARD
app.get("/",(req,res)=>{
 res.send(`
 <h2>FINAL MULTI-STRATEGY SYSTEM</h2>
 <button onclick="location.href='/login'">Login</button>
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

  await updateIP();

  res.send("Login Success. IP: "+serverIP);
 }catch(e){
  res.send("Login failed");
 }
});

app.get("/start",(req,res)=>{BOT_ACTIVE=true;res.send("STARTED");});
app.get("/kill",(req,res)=>{BOT_ACTIVE=false;res.send("STOPPED");});

setInterval(async()=>{
 if(!access_token||!BOT_ACTIVE) return;

 try{
  await updateCapital();

  let indexData=await kite.getLTP(["NSE:NIFTY 50"]);
  let idx=indexData["NSE:NIFTY 50"]?.last_price;
  if(idx){
    indexHistory.push(idx);
    if(indexHistory.length>6) indexHistory.shift();
  }

  let indexTrend=getIndexTrend();

  const quotes=await kite.getQuote(STOCKS.map(s=>"NSE:"+s));

  scanOutput=[];

  for(let s of STOCKS){

    let data=quotes["NSE:"+s];
    if(!data) continue;

    let price=data.last_price;
    let vol=data.volume;

    if(!history[s]) history[s]=[];
    history[s].push(price);
    if(history[s].length>6) history[s].shift();

    if(!volumeHistory[s]) volumeHistory[s]=[];
    volumeHistory[s].push(vol);
    if(volumeHistory[s].length>6) volumeHistory[s].shift();

    let pr=prob(history[s]);
    let volBreak=volumeBreakout(s, vol);

    // STRATEGIES
    let momentum = pr>=0.5;
    let volumeStr = volBreak;
    let indexAlign = indexTrend==="UP" || indexTrend==="DOWN";

    let agreement = [momentum, volumeStr, indexAlign].filter(x=>x).length;

    let signal=null;
    let reason="No edge";

    if(agreement>=2 && pr>=0.5){
      signal = indexTrend==="UP"?"BUY":"SELL";
      reason="Multi-strategy agreement";
    }

    scanOutput.push({
      symbol:s,
      price,
      probability:pr,
      volume:vol,
      volumeBreakout:volBreak,
      indexTrend,
      agreement,
      signal,
      reason
    });

    if(signal && !activeTrades.find(t=>t.symbol===s) && activeTrades.length<5){

      let qty=dynamicQty(price, pr);

      await kite.placeOrder("regular",{
        exchange:"NSE",
        tradingsymbol:s,
        transaction_type:signal,
        quantity:qty,
        product:"MIS",
        order_type:"MARKET"
      });

      activeTrades.push({symbol:s,entry:price,type:signal,qty});
    }
  }

  let unreal=0;
  let remaining=[];

  for(let t of activeTrades){
    let cp=quotes["NSE:"+t.symbol]?.last_price;
    if(!cp) continue;

    let profit=t.type==="BUY"?(cp-t.entry):(t.entry-cp);

    if(profit>t.entry*0.003 || profit<-t.entry*0.002){
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
      unreal+=profit*t.qty;
      remaining.push(t);
    }
  }

  activeTrades=remaining;

  let realized=closedTrades.reduce((a,b)=>a+b,0);
  pnl=realized+unreal;

 }catch(e){}
},3000);

app.get("/performance",(req,res)=>{
 res.json({
  botActive:BOT_ACTIVE,
  capital,
  pnl,
  serverIP,
  activeTradesCount:activeTrades.length,
  scan:scanOutput,
  activeTrades,
  closedTrades
 });
});

app.listen(process.env.PORT||3000);
