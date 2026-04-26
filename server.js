require("dotenv").config();
const express = require("express");
const axios = require("axios");
const { KiteConnect } = require("kiteconnect");

const app = express();
const kite = new KiteConnect({ api_key: process.env.KITE_API_KEY });

// ================= CORE STATE =================
let access_token=null;
let BOT_ACTIVE=false;

let capital=0;
let pnl=0;
let activeTrades=[];
let closedTrades=[];
let history={}, volumeHistory={}, scanOutput=[];
let serverIP="UNKNOWN";

// ================= WEALTH LAYER (NEW) =================
let taxConfig = {
  taxRate: 0.30,          // intraday approx
  withdrawPercent: 0.20   // withdraw 20% of profit
};

let wealthStats = {
  totalProfit: 0,
  taxReserve: 0,
  withdrawable: 0,
  reinvestable: 0
};

function updateWealth(pnlValue){
  if(pnlValue <= 0) return;

  wealthStats.totalProfit = pnlValue;

  wealthStats.taxReserve = pnlValue * taxConfig.taxRate;
  wealthStats.withdrawable = pnlValue * taxConfig.withdrawPercent;
  wealthStats.reinvestable = pnlValue - wealthStats.taxReserve - wealthStats.withdrawable;
}

// ================= SAFETY =================
process.on("uncaughtException", e=>console.error("UNCAUGHT:",e));
process.on("unhandledRejection", e=>console.error("UNHANDLED:",e));

// ================= HELPERS =================
async function updateIP(){
 try{
  let res = await axios.get("https://api.ipify.org?format=json");
  serverIP = res.data.ip;
 }catch(e){}
}

async function updateCapital(){
 try{
  let m=await kite.getMargins();
  capital=m?.equity?.available?.cash||m?.equity?.net||0;
 }catch(e){}
}

function prob(a){
 if(a.length<4) return 0;
 let up=0;
 for(let i=1;i<a.length;i++) if(a[i]>a[i-1]) up++;
 return up/a.length;
}

// ================= INDEX =================
let indexHistory=[];
function getIndexTrend(){
 if(indexHistory.length<5) return "UNKNOWN";
 let up=0;
 for(let i=1;i<indexHistory.length;i++){
  if(indexHistory[i]>indexHistory[i-1]) up++;
 }
 return up>=3?"UP":"DOWN";
}

// ================= VOLUME =================
function volumeBreakout(symbol, vol){
 if(!volumeHistory[symbol]) return false;
 let avg = volumeHistory[symbol].reduce((a,b)=>a+b,0)/volumeHistory[symbol].length;
 return vol > avg * 1.5;
}

// ================= ADVANCED ENGINE =================
function tradeQualityScore(pr, volBreak, agreement){
 return Math.min(100,(pr*40)+(volBreak?30:10)+(agreement*10));
}

let autoConfig={minQuality:65,minProb:0.5};

function passesAutoFilter(q,pr){
 return q>=autoConfig.minQuality && pr>=autoConfig.minProb;
}

function entryCheck(signal, price, history, s){
 let prev = history[s]?.[history[s].length-2];
 if(signal==="BUY" && prev && price<prev) return false;
 if(signal==="SELL" && prev && price>prev) return false;
 return true;
}

function riskGate(symbol, price, qty){
 let exposure = activeTrades.reduce((a,t)=>a+(t.entry*t.qty),0);
 return (exposure + price*qty) <= capital*0.6;
}

function finalQty(price, riskPct){
 if(!capital) return 1;
 return Math.max(1,Math.floor((capital*riskPct)/price));
}

async function smartOrderRoute(params){
 await kite.placeOrder("regular",params);
}

// ================= EXECUTION =================
function shouldEnterTrade({agreement, pr, quality, signal, symbol, price}){
 if(!signal) return false;
 if(!passesAutoFilter(quality, pr)) return false;
 if(!entryCheck(signal, price, history, symbol)) return false;

 let qty = finalQty(price, pr>=0.6?0.05:0.02);
 if(!riskGate(symbol, price, qty)) return false;

 return {signal, qty};
}

async function placeTrade(symbol, signal, qty, price){
 await smartOrderRoute({
  exchange:"NSE",
  tradingsymbol:symbol,
  transaction_type:signal,
  quantity:qty,
  product:"MIS",
  order_type:"MARKET"
 });

 activeTrades.push({symbol, entry:price, type:signal, qty});
}

// ================= STOCKS =================
const STOCKS=["RELIANCE","TCS","INFY","HDFCBANK","ICICIBANK","SBIN","ITC","LT","AXISBANK","KOTAKBANK"];

// ================= DASHBOARD =================
app.get("/",(req,res)=>{
 res.send(`<h2>FINAL ENGINE + WEALTH LAYER</h2><pre id="d"></pre>
 <script>
 setInterval(async()=>{
  let r=await fetch('/performance');
  let d=await r.json();
  document.getElementById('d').innerText=JSON.stringify(d,null,2);
 },2000);
 </script>`);
});

app.get("/login",(req,res)=>res.redirect(kite.getLoginURL()));

app.get("/redirect",async(req,res)=>{
 try{
  const s=await kite.generateSession(req.query.request_token,process.env.KITE_API_SECRET);
  access_token=s.access_token;
  kite.setAccessToken(access_token);
  BOT_ACTIVE=true;
  await updateIP();
  res.send("Login Success IP:"+serverIP);
 }catch(e){res.send("Login failed");}
});

// ================= MAIN LOOP =================
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

    let momentum=pr>=0.5;
    let indexAlign=indexTrend==="UP"||indexTrend==="DOWN";

    let agreement = [momentum, volBreak, indexAlign].filter(x => x).length;

    let quality = tradeQualityScore(pr, volBreak, agreement);

    let signal = null;

    if (
      agreement >= 2 &&
      pr >= 0.5 &&
      quality >= 65
    ){
      signal = indexTrend === "UP" ? "BUY" : "SELL";
    }

    scanOutput.push({
      symbol:s,price,probability:pr,volume:vol,
      volumeBreakout:volBreak,indexTrend,agreement,
      tradeQualityScore:quality,signal
    });

    let result=shouldEnterTrade({
      agreement,pr,quality,signal,
      symbol:s,price
    });

    if(result && !activeTrades.find(t=>t.symbol===s) && activeTrades.length<5){
      await placeTrade(s,result.signal,result.qty,price);
    }
  }

  // EXIT LOGIC
  let unreal=0, remaining=[];
  for(let t of activeTrades){
    let cp=quotes["NSE:"+t.symbol]?.last_price;
    if(!cp) continue;

    let profit=t.type==="BUY"?(cp-t.entry):(t.entry-cp);

    if(profit>t.entry*0.003 || profit<-t.entry*0.002){
      await smartOrderRoute({
        exchange:"NSE",
        tradingsymbol:t.symbol,
        transaction_type:t.type==="BUY"?"SELL":"BUY",
        quantity:t.qty,
        product:"MIS",
        order_type:"MARKET"
      });

      closedTrades.push(profit*t.qty);
    }else{
      unreal+=profit*t.qty;
      remaining.push(t);
    }
  }

  activeTrades=remaining;
  let realized=closedTrades.reduce((a,b)=>a+b,0);
  pnl=realized+unreal;

  // 🔥 UPDATE WEALTH LAYER
  updateWealth(pnl);

 }catch(e){}
},3000);

// ================= PERFORMANCE =================
app.get("/performance",(req,res)=>{
 res.json({
  botActive:BOT_ACTIVE,
  capital,
  pnl,
  serverIP,
  activeTradesCount:activeTrades.length,
  scan:scanOutput,
  activeTrades,
  closedTrades,

  // 🔥 NEW DASHBOARD FIELDS
  wealth: wealthStats
 });
});

app.listen(process.env.PORT||3000);