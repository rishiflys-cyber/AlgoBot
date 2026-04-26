// STEP 11: VaR RISK ENGINE (NO DOWNGRADE)

require("dotenv").config();
const express = require("express");
const axios = require("axios");
const { KiteConnect } = require("kiteconnect");

const app = express();
const kite = new KiteConnect({ api_key: process.env.KITE_API_KEY });

// CORE
let access_token=null, BOT_ACTIVE=false;
let capital=0, pnl=0, peakPnL=0;
let activeTrades=[], closedTrades=[];
let history={}, volumeHistory={}, scanOutput=[];
let indexHistory=[];
let lossTracker={};

// PERFORMANCE
let perfStats={totalTrades:0,wins:0,losses:0,totalWin:0,totalLoss:0};

// WEALTH
let wealthConfig={ taxRate:0.30, withdrawRate:0.20 };
let wealthStats={ totalProfit:0, taxReserve:0, withdrawable:0, reinvestable:0 };

// STEP 10
let maxDrawdownPct = 0.10;
let tradingHalted = false;

// 🔥 STEP 11 — VaR ENGINE
let VaRLimit = 0.05; // 5% of capital

function calculateVaR(){
 let totalExposure = activeTrades.reduce((a,t)=>a+(t.entry*t.qty),0);
 return totalExposure / (capital || 1);
}

function checkVaR(){
 let varValue = calculateVaR();
 return varValue < VaRLimit;
}

// DRAW DOWN
function checkDrawdown(){
 if(pnl > peakPnL) peakPnL = pnl;
 let dd = (peakPnL - pnl) / (peakPnL || 1);
 if(dd >= maxDrawdownPct) tradingHalted = true;
}

// CAPITAL SCALING
let baseRisk=0.02;
let dynamicRisk=0.02;

function updateRisk(){
 let { expectancy } = getMetrics();
 if(expectancy > 0) dynamicRisk = Math.min(0.05, baseRisk + 0.01);
 else dynamicRisk = Math.max(0.01, baseRisk - 0.01);
}

// LOGIN
app.get("/login",(req,res)=> res.redirect(kite.getLoginURL()));
app.get("/redirect", async (req,res)=>{
 try{
  const s=await kite.generateSession(req.query.request_token,process.env.KITE_API_SECRET);
  access_token=s.access_token;
  kite.setAccessToken(access_token);
  BOT_ACTIVE=true;
  res.send("Login Success");
 }catch(e){ res.send("Login Failed"); }
});

// HELPERS
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

function volumeBreakout(s,v){
 if(!volumeHistory[s]) return false;
 let avg=volumeHistory[s].reduce((a,b)=>a+b,0)/volumeHistory[s].length;
 return v>avg*1.5;
}

function tradeQualityScore(pr,vb,ag){
 return Math.min(100,(pr*40)+(vb?30:10)+(ag*10));
}

function detectRegime(p){
 if(p.length<5) return "NORMAL";
 let r=(Math.max(...p)-Math.min(...p))/Math.min(...p);
 if(r<0.002) return "SIDEWAYS";
 if(r>0.01) return "VOLATILE";
 return "NORMAL";
}

function riskGate(price, qty){
 let exp=activeTrades.reduce((a,t)=>a+(t.entry*t.qty),0);
 return (exp+price*qty)<=capital*0.6;
}

function entryCheck(sig,price,h){
 let prev=h[h.length-2];
 if(!prev) return true;
 if(sig==="BUY"&&price<prev) return false;
 return true;
}

function portfolioAllocator(q){
 if(q>=80) return 0.05;
 if(q>=70) return 0.035;
 return 0.02;
}

function positionSize(price,q){
 let alloc=portfolioAllocator(q)*(dynamicRisk/baseRisk);
 if(activeTrades.length>=3) alloc*=0.7;
 if(activeTrades.length>=4) alloc*=0.5;
 return Math.max(1,Math.floor((capital*alloc)/price));
}

function calcVol(p){
 if(p.length<2) return 0;
 return p.slice(1).map((v,i)=>Math.abs(v-p[i])).reduce((a,b)=>a+b,0)/(p.length-1);
}

function getSLTP(entry,p){
 let vol=calcVol(p);
 let sl=Math.max(0.002,(vol/entry)*1.5);
 let tp=sl*1.5;
 return {sl,tp};
}

function checkCooldown(s){
 let d=lossTracker[s];
 if(!d) return false;
 if(d.lossCount<2) return false;
 return (Date.now()-d.lastLossTime)/60000<10;
}

function updateLoss(s,p){
 if(!lossTracker[s]) lossTracker[s]={lossCount:0,lastLossTime:0};
 if(p<0){ lossTracker[s].lossCount++; lossTracker[s].lastLossTime=Date.now(); }
 else lossTracker[s]={lossCount:0,lastLossTime:0};
}

function updatePerformance(p){
 perfStats.totalTrades++;
 if(p>0){ perfStats.wins++; perfStats.totalWin+=p; }
 else{ perfStats.losses++; perfStats.totalLoss+=p; }
}

function getMetrics(){
 let wr=perfStats.totalTrades?perfStats.wins/perfStats.totalTrades:0;
 let avgW=perfStats.wins?perfStats.totalWin/perfStats.wins:0;
 let avgL=perfStats.losses?Math.abs(perfStats.totalLoss/perfStats.losses):0;
 let exp=(wr*avgW)-((1-wr)*avgL);
 return {winRate:wr,avgWin:avgW,avgLoss:avgL,expectancy:exp};
}

function updateWealth(p){
 if(p<=0) return;
 wealthStats.totalProfit=p;
 wealthStats.taxReserve=p*wealthConfig.taxRate;
 wealthStats.withdrawable=p*wealthConfig.withdrawRate;
 wealthStats.reinvestable=p-wealthStats.taxReserve-wealthStats.withdrawable;
}

// STOCKS
const STOCKS=["RELIANCE","TCS","INFY","HDFCBANK","ICICIBANK"];

// LOOP
setInterval(async()=>{
 if(!access_token||!BOT_ACTIVE) return;

 try{
  await updateCapital();
  updateRisk();

  const idx=await kite.getLTP(["NSE:NIFTY 50"]);
  let idxPrice=idx["NSE:NIFTY 50"]?.last_price;
  if(idxPrice){
    indexHistory.push(idxPrice);
    if(indexHistory.length>6) indexHistory.shift();
  }

  let regime=detectRegime(indexHistory);

  const quotes=await kite.getQuote(STOCKS.map(s=>"NSE:"+s));
  scanOutput=[];

  for(let s of STOCKS){

    if(tradingHalted) break;
    if(!checkVaR()) break; // 🔥 VaR control
    if(checkCooldown(s)) continue;

    let d=quotes["NSE:"+s];
    if(!d) continue;

    let price=d.last_price, vol=d.volume;

    history[s]=history[s]||[];
    history[s].push(price);
    if(history[s].length>6) history[s].shift();

    volumeHistory[s]=volumeHistory[s]||[];
    volumeHistory[s].push(vol);
    if(volumeHistory[s].length>6) volumeHistory[s].shift();

    let pr=prob(history[s]);
    let vb=volumeBreakout(s,vol);

    let ag=[pr>=0.5,vb].filter(x=>x).length;
    let quality=tradeQualityScore(pr,vb,ag);

    let signal=null;

    if(regime!=="SIDEWAYS" && ag>=1 && pr>=(regime==="VOLATILE"?0.6:0.5) && quality>=(regime==="VOLATILE"?70:65)){
      signal="BUY";
    }

    scanOutput.push({symbol:s,price,quality,signal,VaR:calculateVaR()});

    if(signal && !activeTrades.find(t=>t.symbol===s)){
      if(!entryCheck(signal,price,history[s])) continue;

      let qty=positionSize(price,quality);
      if(!riskGate(price,qty)) continue;

      let {sl,tp}=getSLTP(price,history[s]);

      await kite.placeOrder("regular",{
        exchange:"NSE",tradingsymbol:s,
        transaction_type:"BUY",quantity:qty,
        product:"MIS",order_type:"MARKET"
      });

      activeTrades.push({symbol:s,entry:price,qty,sl,tp});
    }
  }

  let remaining=[];
  for(let t of activeTrades){
    let cp=quotes["NSE:"+t.symbol]?.last_price;
    if(!cp) continue;

    let profit=cp-t.entry;

    if(profit>t.entry*t.tp || profit<-t.entry*t.sl){
      await kite.placeOrder("regular",{
        exchange:"NSE",tradingsymbol:t.symbol,
        transaction_type:"SELL",quantity:t.qty,
        product:"MIS",order_type:"MARKET"
      });

      let pnlTrade=profit*t.qty;
      closedTrades.push(pnlTrade);

      updateLoss(t.symbol,pnlTrade);
      updatePerformance(pnlTrade);

    } else {
      remaining.push(t);
    }
  }

  activeTrades=remaining;
  pnl=closedTrades.reduce((a,b)=>a+b,0);

  updateWealth(pnl);
  checkDrawdown();

 }catch(e){}
},3000);

// DASHBOARD
app.get("/performance",(req,res)=>{
 res.json({
  capital,
  pnl,
  VaR: calculateVaR(),
  halted:tradingHalted,
  performance:getMetrics(),
  wealth:wealthStats,
  activeTrades,
  closedTrades,
  scan:scanOutput
 });
});

app.listen(process.env.PORT||3000);
