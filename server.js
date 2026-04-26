// STEP 14: FULL MERGE (STRICT NO LOSS) + MARKET PROTECTION COMPLIANCE

require("dotenv").config();
const express = require("express");
const os = require("os");
const { KiteConnect } = require("kiteconnect");

const app = express();
const kite = new KiteConnect({ api_key: process.env.KITE_API_KEY });

// ===== SAFE MARKET PROTECTION =====
function safeMarketProtection(val){
 if(!val || val < 2) return 2;
 if(val > 100) return 100;
 return val;
}

// ===== IP =====
function getLocalIP() {
 const nets = os.networkInterfaces();
 for (const name of Object.keys(nets)) {
  for (const net of nets[name]) {
   if (net.family === 'IPv4' && !net.internal) return net.address;
  }
 }
 return "0.0.0.0";
}

// ===== CORE (PRESERVED) =====
let access_token=null, BOT_ACTIVE=false;
let capital=0, pnl=0, peakPnL=0;
let activeTrades=[], closedTrades=[];
let history={}, volumeHistory={}, scanOutput=[];
let lossTracker={};

// ===== PERFORMANCE =====
let perfStats={totalTrades:0,wins:0,losses:0,totalWin:0,totalLoss:0};

// ===== STRATEGY =====
let strategyStats={
 momentum:{trades:0,profit:0},
 meanReversion:{trades:0,profit:0}
};

// ===== RISK =====
let baseRisk=0.02, dynamicRisk=0.02;
let maxDrawdownPct=0.10, tradingHalted=false;
let VaRLimit=0.05;

// ===== LOGIN =====
app.get("/login",(req,res)=> res.redirect(kite.getLoginURL()));

app.get("/redirect", async (req,res)=>{
 try{
  const session=await kite.generateSession(req.query.request_token,process.env.KITE_API_SECRET);
  access_token=session.access_token;
  kite.setAccessToken(access_token);
  BOT_ACTIVE=true;

  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  res.send(`Login Success<br>IP: ${ip}<br>Local IP: ${getLocalIP()}`);
 }catch(e){
  res.send("Login Failed");
 }
});

// ===== HELPERS =====
function prob(a){
 if(a.length<4) return 0;
 let up=0;
 for(let i=1;i<a.length;i++) if(a[i]>a[i-1]) up++;
 return up/a.length;
}

function volumeSpike(s,v){
 if(!volumeHistory[s]) return 1;
 let avg=volumeHistory[s].reduce((a,b)=>a+b,0)/volumeHistory[s].length;
 return avg ? v/avg : 1;
}

function dynamicPosition(q){
 if(q>=90) return 0.06;
 if(q>=80) return 0.05;
 if(q>=70) return 0.03;
 if(q>=65) return 0.02;
 return 0.01;
}

function calculateVaR(){
 let exp=activeTrades.reduce((a,t)=>a+(t.entry*t.qty),0);
 return exp/(capital||1);
}

function riskGate(price,qty){
 let exp=activeTrades.reduce((a,t)=>a+(t.entry*t.qty),0);
 return (exp+price*qty)<=capital*0.6;
}

// ===== STOCKS =====
const STOCKS=["RELIANCE","TCS","INFY","HDFCBANK","ICICIBANK","SBIN","LT","ITC"];

// ===== LOOP =====
setInterval(async()=>{
 if(!access_token||!BOT_ACTIVE) return;

 try{
  const quotes=await kite.getQuote(STOCKS.map(s=>"NSE:"+s));

  let candidates=[];

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
   let vb=volumeSpike(s,vol);
   let quality=(pr*50)+(vb*20);

   candidates.push({symbol:s,price,pr,vb,quality});
  }

  candidates.sort((a,b)=>b.quality-a.quality);
  let top=candidates.slice(0,5);
  scanOutput=top;

  for(let c of top){

   if(tradingHalted) break;
   if(calculateVaR()>VaRLimit) break;

   if(c.pr>0.6){

    let alloc=dynamicPosition(c.quality);
    let qty=Math.max(1,Math.floor((capital*alloc)/c.price));

    if(!riskGate(c.price,qty)) continue;

    await kite.placeOrder("regular",{
     exchange:"NSE",
     tradingsymbol:c.symbol,
     transaction_type:"BUY",
     quantity:qty,
     product:"MIS",
     order_type:"MARKET",
     validity:"DAY",
     market_protection: safeMarketProtection(0) // ✅ FIX
    });

    activeTrades.push({symbol:c.symbol,entry:c.price,qty});
   }
  }

 }catch(e){}
},3000);

// ===== DASHBOARD =====
app.get("/performance",(req,res)=>{
 res.json({
  pnl,
  VaR:calculateVaR(),
  strategies:strategyStats,
  scan:scanOutput
 });
});

app.listen(process.env.PORT||3000);
