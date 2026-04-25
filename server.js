
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
let volatilityMap={};
let priceHistory={};
let lossTracker={};

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
 let avg = (volumeHistory[symbol] && volumeHistory[symbol].length>0) ? volumeHistory[symbol].reduce((a,b)=>a+b,0)/volumeHistory[symbol].length : vol || 1;
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
    // VOLATILITY
    if(!priceHistory[s]) priceHistory[s]=[];
    priceHistory[s].push(price);
    if(priceHistory[s].length>20) priceHistory[s].shift();

    let volatility=0;
    if(priceHistory[s].length>5){
      let moves=[];
      for(let i=1;i<priceHistory[s].length;i++){
        moves.push(Math.abs(priceHistory[s][i]-priceHistory[s][i-1]));
      }
      volatility = moves.reduce((a,b)=>a+b,0)/moves.length;
    }
    volatilityMap[s]=volatility;


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
    let vol = volatilityMap[t.symbol] || 0;
    let volPercent = t.entry ? (vol/t.entry):0;
    let slPercent = Math.max(volPercent*1.2,0.0015);
    let tpPercent = slPercent*1.5;

    if(profit > t.entry*tpPercent || profit < -t.entry*slPercent){
      await kite.placeOrder("regular",{
        exchange:"NSE",
        tradingsymbol:t.symbol,
        transaction_type: t.type==="BUY"?"SELL":"BUY",
        quantity:t.qty,
        product:"MIS",
        order_type:"MARKET"
      });

      closedTrades.push(profit*t.qty);
      if(!lossTracker[t.symbol]) lossTracker[t.symbol]={consecutive:0,cooldown:0};
      if(profit<0){ lossTracker[t.symbol].consecutive+=1;} else {lossTracker[t.symbol].consecutive=0;}
      if(lossTracker[t.symbol].consecutive>=2){
        lossTracker[t.symbol].cooldown=Date.now()+5*60*1000;
      }

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


// ================== MTF + RANKING ACTIVATION (NON-BREAKING) ==================

// --- MTF STORAGE ---
let mtfHistory = {};

// helper to update MTF
function updateMTF(symbol, price){
  if(!mtfHistory[symbol]) mtfHistory[symbol]={m1:[], m5:[]};

  mtfHistory[symbol].m1.push(price);
  if(mtfHistory[symbol].m1.length>20) mtfHistory[symbol].m1.shift();

  mtfHistory[symbol].m5.push(price);
  if(mtfHistory[symbol].m5.length>100) mtfHistory[symbol].m5.shift();
}

// helper to get trend
function getMTFTrend(arr){
  if(arr.length<5) return "UNKNOWN";
  let up=0;
  for(let i=1;i<arr.length;i++){
    if(arr[i]>arr[i-1]) up++;
  }
  return up >= arr.length/2 ? "UP":"DOWN";
}

// ranking function
function rankCandidates(scan){
  return scan
    .filter(x=>x.signal)
    .sort((a,b)=> (b.tradeQualityScore||0)-(a.tradeQualityScore||0))
    .slice(0,5)
    .map(x=>x.symbol);
}

// ================== INTEGRATION HOOK ==================
// NOTE: Place inside main loop AFTER scanOutput is built

let topSymbols = rankCandidates(scanOutput);

for(let s of STOCKS){

  if(!topSymbols.includes(s)) continue;

  // MTF update
  let data = quotes["NSE:"+s];
  if(!data) continue;

  let price = data.last_price;
  updateMTF(s, price);

  let m1Trend = getMTFTrend(mtfHistory[s].m1);
  let m5Trend = getMTFTrend(mtfHistory[s].m5);

  let mtfAligned = (
    (m1Trend==="UP" && m5Trend!=="DOWN") ||
    (m1Trend==="DOWN" && m5Trend!=="UP")
  );

  if(!mtfAligned){
    continue; // skip trade
  }

  // enhanced qty (fallback safe)
  let scoreObj = scanOutput.find(x=>x.symbol===s);
  let score = scoreObj?.tradeQualityScore || 60;

  let qty = dynamicQty(price, score/100);

  // original execution continues unchanged
}

// ================== END ACTIVATION ==================


// ================== PORTFOLIO ALLOCATOR + CLUSTER CONTROL + IST TIME ==================

// SECTOR MAP
const sectorMap = {
  RELIANCE:"ENERGY", TCS:"IT", INFY:"IT", HDFCBANK:"BANK", ICICIBANK:"BANK",
  SBIN:"BANK", ITC:"FMCG", LT:"INFRA", AXISBANK:"BANK", KOTAKBANK:"BANK"
};

// sector exposure tracker
let sectorExposure = {};

// reset daily
function resetExposure(){
  sectorExposure = {};
}

// IST TIME
function getIST(){
  return new Date(new Date().toLocaleString("en-US",{timeZone:"Asia/Kolkata"}));
}

function isTradingTime(){
  let t=getIST();
  let m=t.getHours()*60+t.getMinutes();
  return m>=560 && m<=885; // 9:20 to 14:45
}

function isSquareOff(){
  let t=getIST();
  let m=t.getHours()*60+t.getMinutes();
  return m>=885;
}

// portfolio allocator
function canAllocate(symbol){
  let sector = sectorMap[symbol] || "OTHER";
  let maxPerSector = 2;

  if(!sectorExposure[sector]) sectorExposure[sector]=0;

  if(sectorExposure[sector] >= maxPerSector){
    return False;
  }

  return True;
}

// ================== INTEGRATION ==================

// inside STOCK loop BEFORE order placement:
// ADD:
// if(!isTradingTime()) signal=null;

// modify execution condition:
/// if(signal && ...)
/// becomes:

/// if(signal && canAllocate(s) && ...)


// after placing trade:
/// sectorExposure[sectorMap[s]] = (sectorExposure[sectorMap[s]]||0)+1;


// ================== SQUARE OFF ==================
// inside activeTrades loop before SL/TP:

// if(isSquareOff()){
//   close trade immediately
// }

