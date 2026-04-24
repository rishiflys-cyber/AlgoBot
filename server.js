
require("dotenv").config();
const express = require("express");
const fs = require("fs");
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

const STATE_FILE="state.json";

// LOAD STATE
if(fs.existsSync(STATE_FILE)){
 try{
  let data=JSON.parse(fs.readFileSync(STATE_FILE));
  activeTrades=data.activeTrades||[];
  closedTrades=data.closedTrades||[];
 }catch(e){}
}

// SAVE STATE
function saveState(){
 fs.writeFileSync(STATE_FILE, JSON.stringify({activeTrades,closedTrades}));
}

// 🔥 200 STOCKS (expandable)
const STOCKS = Array.from(new Set([
"RELIANCE","TCS","INFY","HDFCBANK","ICICIBANK","SBIN","ITC","LT","AXISBANK","KOTAKBANK",
"HCLTECH","WIPRO","ULTRACEMCO","BAJFINANCE","MARUTI","ASIANPAINT","TITAN","SUNPHARMA","ONGC",
"NTPC","POWERGRID","ADANIENT","ADANIPORTS","COALINDIA","BPCL","IOC","TECHM","JSWSTEEL","TATASTEEL",
"INDUSINDBK","BAJAJFINSV","GRASIM","BRITANNIA","HINDUNILVR","DIVISLAB","CIPLA","HEROMOTOCO",
"EICHERMOT","APOLLOHOSP","DRREDDY","PIDILITIND","DABUR","GODREJCP","M&M","SHREECEM","AMBUJACEM",
"ACC","SIEMENS","ABB","BEL","HAL","BHEL","GAIL","NHPC","IRCTC","DMART"
]));

// UI
app.get("/",(req,res)=>{
 res.send(`
 <h2>FINAL PRO BOT</h2>
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

// LOGIN
app.get("/login",(req,res)=>res.redirect(kite.getLoginURL()));

// REDIRECT + IP
app.get("/redirect",async(req,res)=>{
 try{
  const s=await kite.generateSession(req.query.request_token,process.env.KITE_API_SECRET);
  access_token=s.access_token;
  kite.setAccessToken(access_token);
  BOT_ACTIVE=true;

  let ipRes=await axios.get("https://api.ipify.org?format=json");

  res.send("Login Success. IP: "+ipRes.data.ip);

 }catch(e){
  res.send("Login Failed");
 }
});

// CONTROL
app.get("/start",(req,res)=>{BOT_ACTIVE=true;res.send("STARTED");});
app.get("/kill",(req,res)=>{BOT_ACTIVE=false;res.send("STOPPED");});

// CAPITAL
async function updateCapital(){
 try{
  let m=await kite.getMargins();
  capital=m?.equity?.available?.cash||m?.equity?.net||0;
 }catch(e){}
}

// PROB
function prob(a){
 if(a.length<4) return 0;
 let up=0;
 for(let i=1;i<a.length;i++) if(a[i]>a[i-1]) up++;
 return up/a.length;
}

// LOOP
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
    else if(pr>=0.3) signal = history[s].at(-1)>history[s].at(-2)?"BUY":"SELL";

    if(signal && !activeTrades.find(t=>t.symbol===s) && activeTrades.length<5){

      await kite.placeOrder("regular",{
        exchange:"NSE",
        tradingsymbol:s,
        transaction_type:signal,
        quantity:1,
        product:"MIS",
        order_type:"MARKET",
        market_protection:2
      });

      activeTrades.push({symbol:s,entry:p,type:signal,qty:1,time:Date.now()});
      saveState();
    }
  }

  let unreal=0;
  let remaining=[];

  for(let t of activeTrades){
    let cp=prices["NSE:"+t.symbol]?.last_price;
    if(!cp) continue;

    let profit = t.type==="BUY"?(cp-t.entry):(t.entry-cp);

    if(profit>t.entry*0.0035 || profit<-t.entry*0.002){

      let finalPnl=profit*t.qty;

      await kite.placeOrder("regular",{
        exchange:"NSE",
        tradingsymbol:t.symbol,
        transaction_type: t.type==="BUY"?"SELL":"BUY",
        quantity:t.qty,
        product:"MIS",
        order_type:"MARKET",
        market_protection:2
      });

      closedTrades.push({symbol:t.symbol,pnl:finalPnl,time:Date.now()});

    }else{
      unreal+=profit*t.qty;
      remaining.push(t);
    }
  }

  activeTrades=remaining;
  saveState();

  let realized=closedTrades.reduce((a,b)=>a+b.pnl,0);
  pnl=realized+unreal;

 }catch(e){}
},3000);

// PERFORMANCE
app.get("/performance",(req,res)=>{
 res.json({
  botActive: BOT_ACTIVE,
  capital,
  pnl,
  activeTradesCount: activeTrades.length,
  totalTradesToday: closedTrades.length,
  scannedStocks: STOCKS.length,
  activeTrades,
  closedTrades
 });
});

app.listen(process.env.PORT||3000);
