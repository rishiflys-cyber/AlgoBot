// FINAL COMPLETE SYSTEM WITH PORTFOLIO ALLOCATOR + ALL FEATURES

require("dotenv").config();
const express = require("express");
const axios = require("axios");
const { KiteConnect } = require("kiteconnect");

const app = express();
const kite = new KiteConnect({ api_key: process.env.KITE_API_KEY });

// ================= CORE =================
let access_token=null, BOT_ACTIVE=false;
let capital=0, pnl=0;
let activeTrades=[], closedTrades=[];
let history={}, volumeHistory={}, scanOutput=[];
let serverIP="UNKNOWN";

// ================= WEALTH =================
let taxConfig={ taxRate:0.30, withdrawPercent:0.20 };
let wealthStats={ totalProfit:0, taxReserve:0, withdrawable:0, reinvestable:0 };

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
 let d=lossTracker[symbol];
 if(!d) return false;
 return d.count>=2 && (Date.now()-d.time)/60000 < 10;
}
function updateLoss(symbol,p){
 if(!lossTracker[symbol]) lossTracker[symbol]={count:0,time:0};
 if(p<0){ lossTracker[symbol].count++; lossTracker[symbol].time=Date.now(); }
 else lossTracker[symbol]={count:0,time:0};
}

// ================= TIME =================
function canTradeNow(){
 let ist=new Date(new Date().toLocaleString("en-US",{timeZone:"Asia/Kolkata"}));
 let mins=ist.getHours()*60+ist.getMinutes();
 return mins>=560 && mins<=885;
}

// ================= REGIME =================
function detectRegime(p){
 if(p.length<5) return "NORMAL";
 let r=(Math.max(...p)-Math.min(...p))/Math.min(...p);
 if(r<0.002) return "SIDEWAYS";
 if(r>0.01) return "VOLATILE";
 return "NORMAL";
}

// ================= VOL =================
function calcVol(p){
 if(p.length<2) return 0;
 return p.slice(1).map((v,i)=>Math.abs(v-p[i])).reduce((a,b)=>a+b,0)/(p.length-1);
}

// ================= HELPERS =================
async function updateCapital(){
 try{
  let m=await kite.getMargins();
  capital=m?.equity?.available?.cash||m?.equity?.net||0;
 }catch(e){}
}

function prob(a){
 if(a.length<4) return 0;
 let up=0; for(let i=1;i<a.length;i++) if(a[i]>a[i-1]) up++;
 return up/a.length;
}

// ================= QUALITY =================
function tradeQualityScore(pr, vb, ag){
 return Math.min(100,(pr*40)+(vb?30:10)+(ag*10));
}

function entryCheck(sig,price,h,s){
 let prev=h[s]?.[h[s].length-2];
 if(sig==="BUY"&&prev&&price<prev) return false;
 if(sig==="SELL"&&prev&&price>prev) return false;
 return true;
}

function riskGate(symbol,price,qty){
 let exp=activeTrades.reduce((a,t)=>a+(t.entry*t.qty),0);
 return (exp+price*qty)<=capital*0.6;
}

// ================= PORTFOLIO ALLOCATOR =================
function portfolioAllocator({quality}){
 if(quality>=80) return 0.06;
 if(quality>=70) return 0.04;
 return 0.02;
}

// ================= EXECUTION =================
async function placeTrade(s,signal,qty,price){
 await kite.placeOrder("regular",{exchange:"NSE",tradingsymbol:s,transaction_type:signal,quantity:qty,product:"MIS",order_type:"MARKET"});
 activeTrades.push({symbol:s,entry:price,type:signal,qty});
}

// ================= STOCKS =================
const STOCKS=["RELIANCE","TCS","INFY","HDFCBANK","ICICIBANK"];

// ================= LOOP =================
setInterval(async()=>{
 if(!access_token||!BOT_ACTIVE||!canTradeNow()) return;

 try{
  await updateCapital();

  const quotes=await kite.getQuote(STOCKS.map(s=>"NSE:"+s));
  scanOutput=[];

  for(let s of STOCKS){

    if(checkCooldown(s)) continue;

    let d=quotes["NSE:"+s]; if(!d) continue;

    let price=d.last_price, vol=d.volume;

    history[s]=history[s]||[]; history[s].push(price); if(history[s].length>6) history[s].shift();
    volumeHistory[s]=volumeHistory[s]||[]; volumeHistory[s].push(vol); if(volumeHistory[s].length>6) volumeHistory[s].shift();

    let pr=prob(history[s]);
    let vb=vol> (volumeHistory[s].reduce((a,b)=>a+b,0)/volumeHistory[s].length)*1.5;

    let ag=[pr>=0.5,vb,true].filter(x=>x).length;
    let quality=tradeQualityScore(pr,vb,ag);

    let regime=detectRegime(history[s]);
    let signal=null;

    if(regime!=="SIDEWAYS" && ag>=2 && quality>=65){
      signal="BUY";
    }

    scanOutput.push({s,price,pr,quality,regime,signal});

    if(signal && !activeTrades.find(t=>t.symbol===s)){
      if(!entryCheck(signal,price,history,s)) continue;

      let allocPct=portfolioAllocator({quality});
      let qty=Math.max(1,Math.floor((capital*allocPct)/price));

      if(!riskGate(s,price,qty)) continue;

      await placeTrade(s,signal,qty,price);
    }
  }

  let unreal=0, remain=[];
  for(let t of activeTrades){
    let cp=quotes["NSE:"+t.symbol]?.last_price; if(!cp) continue;

    let vol=calcVol(history[t.symbol]||[]);
    let sl=Math.max(0.002,(vol/t.entry)*1.5), tp=sl*1.5;

    let p=(cp-t.entry)*t.qty;

    if(p>t.entry*tp || p<-t.entry*sl){
      await kite.placeOrder("regular",{exchange:"NSE",tradingsymbol:t.symbol,transaction_type:"SELL",quantity:t.qty,product:"MIS",order_type:"MARKET"});
      closedTrades.push(p);
      updatePerf(p);
      updateLoss(t.symbol,p);
    } else {
      unreal+=p; remain.push(t);
    }
  }

  activeTrades=remain;
  pnl=closedTrades.reduce((a,b)=>a+b,0)+unreal;

  updateWealth(pnl);

 }catch(e){}
},3000);

// ================= DASHBOARD =================
app.get("/performance",(req,res)=>{
 res.json({capital,pnl,activeTrades,closedTrades,wealth:wealthStats,expectancy:expectancy()});
});

app.listen(process.env.PORT||3000);
