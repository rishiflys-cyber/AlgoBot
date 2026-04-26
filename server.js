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

// ================= WEALTH =================
let taxConfig={ taxRate:0.30, withdrawPercent:0.20 };

let wealthStats={
 totalProfit:0,
 taxReserve:0,
 withdrawable:0,
 reinvestable:0
};

function updateWealth(p){
 if(p<=0) return;
 wealthStats.totalProfit=p;
 wealthStats.taxReserve=p*taxConfig.taxRate;
 wealthStats.withdrawable=p*taxConfig.withdrawPercent;
 wealthStats.reinvestable=p-wealthStats.taxReserve-wealthStats.withdrawable;
}

// ================= PERFORMANCE =================
let perfStats={wins:0,losses:0,total:0,totalWin:0,totalLoss:0};

function updatePerf(p){
 perfStats.total++;
 if(p>0){ perfStats.wins++; perfStats.totalWin+=p; }
 else{ perfStats.losses++; perfStats.totalLoss+=p; }
}

function expectancy(){
 if(perfStats.total===0) return 0;
 let wr=perfStats.wins/perfStats.total;
 let lr=perfStats.losses/perfStats.total;
 let avgW=perfStats.totalWin/(perfStats.wins||1);
 let avgL=Math.abs(perfStats.totalLoss/(perfStats.losses||1));
 return (wr*avgW)-(lr*avgL);
}

// ================= COOLDOWN =================
let lossTracker={};

function checkCooldown(symbol){
 let data=lossTracker[symbol];
 if(!data) return false;
 if(data.count<2) return false;
 let diff=(Date.now()-data.time)/60000;
 return diff<10;
}

function updateLoss(symbol, profit){
 if(!lossTracker[symbol]) lossTracker[symbol]={count:0,time:0};
 if(profit<0){
   lossTracker[symbol].count++;
   lossTracker[symbol].time=Date.now();
 } else {
   lossTracker[symbol]={count:0,time:0};
 }
}

// ================= TIME FILTER =================
function canTradeNow(){
 let now=new Date();
 let ist=new Date(now.toLocaleString("en-US",{timeZone:"Asia/Kolkata"}));
 let h=ist.getHours(), m=ist.getMinutes();
 let mins=h*60+m;
 return mins>=560 && mins<=885; // 9:20–14:45
}

// ================= REGIME =================
function detectRegime(prices){
 if(prices.length<5) return "NORMAL";
 let max=Math.max(...prices), min=Math.min(...prices);
 let range=(max-min)/min;
 if(range<0.002) return "SIDEWAYS";
 if(range>0.01) return "VOLATILE";
 return "NORMAL";
}

// ================= VOLATILITY =================
function calcVol(prices){
 if(prices.length<2) return 0;
 let arr=[];
 for(let i=1;i<prices.length;i++){
   arr.push(Math.abs(prices[i]-prices[i-1]));
 }
 return arr.reduce((a,b)=>a+b,0)/arr.length;
}

// ================= HELPERS =================
async function updateIP(){
 try{
  let res=await axios.get("https://api.ipify.org?format=json");
  serverIP=res.data.ip;
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
 let avg=volumeHistory[symbol].reduce((a,b)=>a+b,0)/volumeHistory[symbol].length;
 return vol>avg*1.5;
}

// ================= QUALITY =================
function tradeQualityScore(pr, volBreak, agreement){
 return Math.min(100,(pr*40)+(volBreak?30:10)+(agreement*10));
}

function entryCheck(signal, price, history, s){
 let prev=history[s]?.[history[s].length-2];
 if(signal==="BUY"&&prev&&price<prev) return false;
 if(signal==="SELL"&&prev&&price>prev) return false;
 return true;
}

function riskGate(symbol, price, qty){
 let exp=activeTrades.reduce((a,t)=>a+(t.entry*t.qty),0);
 return (exp+price*qty)<=capital*0.6;
}

function finalQty(price, risk){
 if(!capital) return 1;
 return Math.max(1,Math.floor((capital*risk)/price));
}

// ================= EXECUTION =================
async function smartOrderRoute(p){
 await kite.placeOrder("regular",p);
}

async function placeTrade(s, signal, qty, price){
 await smartOrderRoute({
  exchange:"NSE", tradingsymbol:s,
  transaction_type:signal, quantity:qty,
  product:"MIS", order_type:"MARKET"
 });
 activeTrades.push({symbol:s,entry:price,type:signal,qty});
}

// ================= STOCKS =================
const STOCKS=["RELIANCE","TCS","INFY","HDFCBANK","ICICIBANK","SBIN","ITC","LT","AXISBANK","KOTAKBANK"];

// ================= LOOP =================
setInterval(async()=>{
 if(!access_token||!BOT_ACTIVE||!canTradeNow()) return;

 try{
  await updateCapital();

  let idx=await kite.getLTP(["NSE:NIFTY 50"]);
  let priceIdx=idx["NSE:NIFTY 50"]?.last_price;
  if(priceIdx){
    indexHistory.push(priceIdx);
    if(indexHistory.length>6) indexHistory.shift();
  }

  let indexTrend=getIndexTrend();
  let regime=detectRegime(indexHistory);

  let quotes=await kite.getQuote(STOCKS.map(s=>"NSE:"+s));
  scanOutput=[];

  for(let s of STOCKS){

    if(checkCooldown(s)) continue;

    let d=quotes["NSE:"+s];
    if(!d) continue;

    let price=d.last_price;
    let vol=d.volume;

    if(!history[s]) history[s]=[];
    history[s].push(price);
    if(history[s].length>6) history[s].shift();

    if(!volumeHistory[s]) volumeHistory[s]=[];
    volumeHistory[s].push(vol);
    if(volumeHistory[s].length>6) volumeHistory[s].shift();

    let pr=prob(history[s]);
    let volBreak=volumeBreakout(s,vol);

    let momentum=pr>=0.5;
    let indexAlign=indexTrend==="UP"||indexTrend==="DOWN";

    let agreement=[momentum,volBreak,indexAlign].filter(x=>x).length;

    let quality=tradeQualityScore(pr,volBreak,agreement);

    let signal=null;

    if(
      regime!=="SIDEWAYS" &&
      agreement>=2 &&
      pr>=(regime==="VOLATILE"?0.6:0.5) &&
      quality>=(regime==="VOLATILE"?70:65)
    ){
      signal=indexTrend==="UP"?"BUY":"SELL";
    }

    scanOutput.push({symbol:s,price,probability:pr,volume:vol,regime,quality,signal});

    if(signal && !activeTrades.find(t=>t.symbol===s) && activeTrades.length<5){
      if(!entryCheck(signal,price,history,s)) continue;

      let qty=finalQty(price,pr>=0.6?0.05:0.02);
      if(!riskGate(s,price,qty)) continue;

      await placeTrade(s,signal,qty,price);
    }
  }

  // EXIT
  let unreal=0, remain=[];
  for(let t of activeTrades){
    let cp=quotes["NSE:"+t.symbol]?.last_price;
    if(!cp) continue;

    let vol=calcVol(history[t.symbol]||[]);
    let sl=Math.max(0.002,(vol/t.entry)*1.5);
    let tp=sl*1.5;

    let profit=t.type==="BUY"?(cp-t.entry):(t.entry-cp);

    if(profit>t.entry*tp || profit<-t.entry*sl){
      await smartOrderRoute({
        exchange:"NSE",tradingsymbol:t.symbol,
        transaction_type:t.type==="BUY"?"SELL":"BUY",
        quantity:t.qty,product:"MIS",order_type:"MARKET"
      });

      let p=profit*t.qty;
      closedTrades.push(p);
      updatePerf(p);
      updateLoss(t.symbol,p);

    } else {
      unreal+=profit*t.qty;
      remain.push(t);
    }
  }

  activeTrades=remain;
  let realized=closedTrades.reduce((a,b)=>a+b,0);
  pnl=realized+unreal;

  updateWealth(pnl);

 }catch(e){}
},3000);

// ================= DASHBOARD =================
app.get("/performance",(req,res)=>{
 res.json({
  botActive:BOT_ACTIVE,
  capital,
  pnl,
  serverIP,
  scan:scanOutput,
  activeTrades,
  closedTrades,
  wealth:wealthStats,
  expectancy:expectancy()
 });
});

app.listen(process.env.PORT||3000);