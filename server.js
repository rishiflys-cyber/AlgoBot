// STEP 5: DYNAMIC SL/TP (VOLATILITY-BASED) — NO DOWNGRADE

require("dotenv").config();
const express = require("express");
const axios = require("axios");
const { KiteConnect } = require("kiteconnect");

const app = express();
const kite = new KiteConnect({ api_key: process.env.KITE_API_KEY });

// CORE
let access_token=null, BOT_ACTIVE=false;
let capital=0, pnl=0;
let activeTrades=[], closedTrades=[];
let history={}, volumeHistory={}, scanOutput=[];
let indexHistory=[];

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

function prob(arr){
 if(arr.length<4) return 0;
 let up=0;
 for(let i=1;i<arr.length;i++) if(arr[i]>arr[i-1]) up++;
 return up/arr.length;
}

function volumeBreakout(symbol, vol){
 if(!volumeHistory[symbol]) return false;
 let avg=volumeHistory[symbol].reduce((a,b)=>a+b,0)/volumeHistory[symbol].length;
 return vol>avg*1.5;
}

function tradeQualityScore(pr, volBreak, agreement){
 return Math.min(100,(pr*40)+(volBreak?30:10)+(agreement*10));
}

function detectRegime(prices){
 if(prices.length<5) return "NORMAL";
 let max=Math.max(...prices);
 let min=Math.min(...prices);
 let range=(max-min)/min;
 if(range<0.002) return "SIDEWAYS";
 if(range>0.01) return "VOLATILE";
 return "NORMAL";
}

// STEP 3/4 FUNCTIONS (kept)
function riskGate(price, qty){
 let exposure = activeTrades.reduce((a,t)=>a+(t.entry*t.qty),0);
 return (exposure + price*qty) <= capital*0.6;
}

function entryCheck(signal, price, hist){
 let prev = hist[hist.length-2];
 if(!prev) return true;
 if(signal==="BUY" && price < prev) return false;
 return true;
}

function portfolioAllocator(quality){
 if(quality >= 80) return 0.05;
 if(quality >= 70) return 0.035;
 return 0.02;
}

function positionSize(price, quality){
 let allocPct = portfolioAllocator(quality);
 if(activeTrades.length >= 3) allocPct *= 0.7;
 if(activeTrades.length >= 4) allocPct *= 0.5;
 return Math.max(1, Math.floor((capital * allocPct) / price));
}

// 🔥 STEP 5 ADDITIONS — VOLATILITY + DYNAMIC SL/TP
function calcVol(prices){
 if(prices.length < 2) return 0;
 let diffs = [];
 for(let i=1;i<prices.length;i++){
  diffs.push(Math.abs(prices[i] - prices[i-1]));
 }
 return diffs.reduce((a,b)=>a+b,0) / diffs.length;
}

function getSLTP(entry, prices){
 let vol = calcVol(prices);
 let sl = Math.max(0.002, (vol / entry) * 1.5); // floor + volatility
 let tp = sl * 1.5; // RR 1.5
 return { sl, tp };
}

// STOCKS
const STOCKS=["RELIANCE","TCS","INFY","HDFCBANK","ICICIBANK"];

// LOOP
setInterval(async()=>{
 if(!access_token||!BOT_ACTIVE) return;

 try{
  await updateCapital();

  const idxData = await kite.getLTP(["NSE:NIFTY 50"]);
  let idxPrice = idxData["NSE:NIFTY 50"]?.last_price;
  if(idxPrice){
    indexHistory.push(idxPrice);
    if(indexHistory.length>6) indexHistory.shift();
  }

  let regime = detectRegime(indexHistory);

  const quotes=await kite.getQuote(STOCKS.map(s=>"NSE:"+s));
  scanOutput=[];

  for(let s of STOCKS){

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
    let volBreak=volumeBreakout(s,vol);

    let momentum = pr>=0.5;
    let agreement = [momentum, volBreak].filter(x=>x).length;

    let quality = tradeQualityScore(pr, volBreak, agreement);

    let signal=null;

    if(
      regime!=="SIDEWAYS" &&
      agreement>=1 &&
      pr>=(regime==="VOLATILE"?0.6:0.5) &&
      quality>=(regime==="VOLATILE"?70:65)
    ){
      signal="BUY";
    }

    scanOutput.push({
      symbol:s,
      price,
      probability:pr,
      regime,
      agreement,
      quality,
      signal
    });

    if(signal && !activeTrades.find(t=>t.symbol===s)){

      if(!entryCheck(signal, price, history[s])) continue;

      let qty = positionSize(price, quality);

      if(!riskGate(price, qty)) continue;

      let { sl, tp } = getSLTP(price, history[s]);

      await kite.placeOrder("regular",{
        exchange:"NSE",
        tradingsymbol:s,
        transaction_type:"BUY",
        quantity:qty,
        product:"MIS",
        order_type:"MARKET"
      });

      activeTrades.push({
        symbol:s,
        entry:price,
        qty,
        sl,
        tp
      });
    }
  }

  // 🔥 EXIT ENGINE (NEW)
  let remaining=[];
  for(let t of activeTrades){
    let cp = quotes["NSE:"+t.symbol]?.last_price;
    if(!cp) continue;

    let profit = cp - t.entry;

    if(profit > t.entry * t.tp || profit < -t.entry * t.sl){
      await kite.placeOrder("regular",{
        exchange:"NSE",
        tradingsymbol:t.symbol,
        transaction_type:"SELL",
        quantity:t.qty,
        product:"MIS",
        order_type:"MARKET"
      });

      closedTrades.push(profit * t.qty);
    } else {
      remaining.push(t);
    }
  }

  activeTrades = remaining;

  let realized = closedTrades.reduce((a,b)=>a+b,0);
  pnl = realized;

 }catch(e){}
},3000);

// DASHBOARD
app.get("/performance",(req,res)=>{
 res.json({capital,pnl,activeTrades,closedTrades,scan:scanOutput});
});

app.listen(process.env.PORT||3000);
