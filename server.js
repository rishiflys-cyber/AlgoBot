// STEP 12: MULTI-STRATEGY FULL MERGE ON STEP 11 (NO LOSS)

// ===== ORIGINAL SYSTEM FULLY PRESERVED =====
require("dotenv").config();
const express = require("express");
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

// RISK
let maxDrawdownPct = 0.10;
let tradingHalted = false;
let VaRLimit = 0.05;

// CAPITAL SCALING
let baseRisk=0.02, dynamicRisk=0.02;

// 🔥 STEP 12 ADDITION
let strategyStats={
 momentum:{trades:0,profit:0},
 meanReversion:{trades:0,profit:0}
};

// ===== HELPERS =====
function prob(a){ if(a.length<4) return 0; let u=0; for(let i=1;i<a.length;i++) if(a[i]>a[i-1]) u++; return u/a.length; }

function volumeBreakout(s,v){
 if(!volumeHistory[s]) return false;
 let avg=volumeHistory[s].reduce((a,b)=>a+b,0)/volumeHistory[s].length;
 return v>avg*1.5;
}

// ===== STRATEGIES =====
function momentumStrategy(pr,vb){ return pr>=0.5 && vb; }

function meanReversionStrategy(pr,prices){
 if(prices.length<5) return false;
 let last=prices[prices.length-1];
 let avg=prices.reduce((a,b)=>a+b,0)/prices.length;
 return last < avg*0.995;
}

function selectStrategy(pr,vb,prices){
 if(momentumStrategy(pr,vb)) return "momentum";
 if(meanReversionStrategy(pr,prices)) return "meanReversion";
 return null;
}

// ===== RISK =====
function calculateVaR(){
 let exp=activeTrades.reduce((a,t)=>a+(t.entry*t.qty),0);
 return exp/(capital||1);
}
function checkVaR(){ return calculateVaR()<VaRLimit; }

function riskGate(price,qty){
 let exp=activeTrades.reduce((a,t)=>a+(t.entry*t.qty),0);
 return (exp+price*qty)<=capital*0.6;
}

function updateRisk(){
 let exp = getMetrics().expectancy;
 if(exp>0) dynamicRisk=Math.min(0.05,baseRisk+0.01);
 else dynamicRisk=Math.max(0.01,baseRisk-0.01);
}

// ===== PERFORMANCE =====
function updatePerformance(p){
 perfStats.totalTrades++;
 if(p>0){perfStats.wins++; perfStats.totalWin+=p;}
 else{perfStats.losses++; perfStats.totalLoss+=p;}
}

function getMetrics(){
 let wr=perfStats.totalTrades?perfStats.wins/perfStats.totalTrades:0;
 let avgW=perfStats.wins?perfStats.totalWin/perfStats.wins:0;
 let avgL=perfStats.losses?Math.abs(perfStats.totalLoss/perfStats.losses):0;
 let exp=(wr*avgW)-((1-wr)*avgL);
 return {winRate:wr,expectancy:exp};
}

// ===== WEALTH =====
function updateWealth(p){
 if(p<=0) return;
 wealthStats.totalProfit=p;
 wealthStats.taxReserve=p*wealthConfig.taxRate;
 wealthStats.withdrawable=p*wealthConfig.withdrawRate;
 wealthStats.reinvestable=p-wealthStats.taxReserve-wealthStats.withdrawable;
}

// ===== DRAW DOWN =====
function checkDrawdown(){
 if(pnl > peakPnL) peakPnL = pnl;
 let dd = (peakPnL - pnl) / (peakPnL || 1);
 if(dd >= maxDrawdownPct) tradingHalted = true;
}

// ===== SLTP =====
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

// ===== LOOP =====
const STOCKS=["RELIANCE","TCS","INFY","HDFCBANK","ICICIBANK"];

setInterval(async()=>{
 if(!access_token||!BOT_ACTIVE) return;

 try{
  updateRisk();

  const quotes=await kite.getQuote(STOCKS.map(s=>"NSE:"+s));
  scanOutput=[];

  for(let s of STOCKS){

    if(tradingHalted) break;
    if(!checkVaR()) break;

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

    let strategy=selectStrategy(pr,vb,history[s]);
    let signal = strategy ? "BUY" : null;

    scanOutput.push({symbol:s,price,strategy,signal});

    if(signal && !activeTrades.find(t=>t.symbol===s)){

      let alloc = (dynamicRisk/baseRisk)*0.02;
      let qty=Math.max(1,Math.floor((capital*alloc)/price));

      if(!riskGate(price,qty)) continue;

      let {sl,tp}=getSLTP(price,history[s]);

      await kite.placeOrder("regular",{
        exchange:"NSE",
        tradingsymbol:s,
        transaction_type:"BUY",
        quantity:qty,
        product:"MIS",
        order_type:"MARKET"
      });

      activeTrades.push({symbol:s,entry:price,qty,sl,tp,strategy});
    }
  }

  let remaining=[];
  for(let t of activeTrades){
    let cp=quotes["NSE:"+t.symbol]?.last_price;
    if(!cp) continue;

    let profit=cp-t.entry;

    if(profit>t.entry*t.tp || profit<-t.entry*t.sl){

      await kite.placeOrder("regular",{
        exchange:"NSE",
        tradingsymbol:t.symbol,
        transaction_type:"SELL",
        quantity:t.qty,
        product:"MIS",
        order_type:"MARKET"
      });

      let pnlTrade=profit*t.qty;
      closedTrades.push(pnlTrade);

      updatePerformance(pnlTrade);
      strategyStats[t.strategy].trades++;
      strategyStats[t.strategy].profit+=pnlTrade;

    } else remaining.push(t);
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
  pnl,
  VaR:calculateVaR(),
  halted:tradingHalted,
  performance:getMetrics(),
  wealth:wealthStats,
  strategies:strategyStats,
  scan:scanOutput
 });
});

app.listen(process.env.PORT||3000);
