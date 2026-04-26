
require('dotenv').config();
const express=require('express');
const fs=require('fs');
const axios=require('axios');
const KiteConnect=require("kiteconnect").KiteConnect;

const app=express();
const PORT=process.env.PORT||3000;

const LIVE=process.env.LIVE_TRADING==="true";
const TOKEN_FILE="access_token.json";

let kite=new KiteConnect({api_key:process.env.KITE_API_KEY});
let accessToken=null;

let state={
 capital:0,
 pnl:0,
 strategies:{
  momentum:{weight:0.33,pnl:0},
  breakout:{weight:0.33,pnl:0},
  meanReversion:{weight:0.33,pnl:0}
 },
 rankedSignals:[],
 activeTrades:[],
 closedTrades:[],
 mode:LIVE?"LIVE":"PAPER"
};

let lastPrice={};

// LOAD TOKEN
if(fs.existsSync(TOKEN_FILE)){
 try{
  const saved=JSON.parse(fs.readFileSync(TOKEN_FILE));
  accessToken=saved.token;
  kite.setAccessToken(accessToken);
 }catch{}
}

// LOGIN
app.get('/login',(req,res)=>res.redirect(kite.getLoginURL()));

app.get('/redirect',async(req,res)=>{
 try{
  const session=await kite.generateSession(req.query.request_token,process.env.KITE_API_SECRET);
  accessToken=session.access_token;
  kite.setAccessToken(accessToken);
  fs.writeFileSync(TOKEN_FILE,JSON.stringify({token:accessToken}));

  const ip=await axios.get("https://api.ipify.org?format=json");
  res.send("Login success | IP: "+ip.data.ip);
 }catch{
  res.send("Login failed");
 }
});

// CAPITAL
async function updateCapital(){
 try{
  const m=await kite.getMargins();
  state.capital =
    m?.equity?.available?.cash ||
    m?.equity?.net ||
    state.capital;
 }catch{}
}

// STRATEGY DETECTION
function detectStrategy(q,prev){
 if(!prev||!q.ohlc) return null;

 if(q.last_price>prev) return "momentum";
 if(q.last_price>q.ohlc.high*0.995) return "breakout";
 if(q.last_price<q.ohlc.low*1.005) return "meanReversion";

 return null;
}

// SELF LEARNING ENGINE
function updateWeights(){
 let totalPnl = Object.values(state.strategies)
   .reduce((sum,s)=>sum+s.pnl,0);

 if(totalPnl===0) return;

 for(const key in state.strategies){
  let s=state.strategies[key];
  let performance = s.pnl / totalPnl;

  s.weight = Math.max(0.1, Math.min(0.7, performance));
 }

 // normalize
 let sum = Object.values(state.strategies)
   .reduce((a,b)=>a+b.weight,0);

 for(const key in state.strategies){
  state.strategies[key].weight /= sum;
 }
}

// MAIN LOOP
setInterval(async()=>{
 try{
  if(!accessToken) return;

  await updateCapital();

  const stocks=[
   "NSE:RELIANCE","NSE:TCS","NSE:INFY","NSE:HDFCBANK","NSE:ICICIBANK",
   "NSE:SBIN","NSE:AXISBANK","NSE:KOTAKBANK","NSE:ITC","NSE:LT"
  ];

  const quotes=await kite.getQuote(stocks);

  let signals=[];

  for(const sym of stocks){
   const q=quotes[sym];
   if(!q||!q.last_price) continue;

   const strategy=detectStrategy(q,lastPrice[sym]);
   lastPrice[sym]=q.last_price;

   if(strategy){
    const weight=state.strategies[strategy].weight;

    signals.push({
     symbol:sym,
     strategy,
     score:weight,
     price:q.last_price
    });
   }
  }

  signals.sort((a,b)=>b.score-a.score);
  const top=signals.slice(0,5);

  state.rankedSignals=top;

  for(const s of top){
   if(state.activeTrades.length>=5) break;
   if(state.capital<=0) continue;

   const alloc = state.capital * state.strategies[s.strategy].weight;
   const qty=Math.max(1,Math.floor((alloc*0.02)/s.price));

   if(LIVE){
    const [exchange,tradingsymbol]=s.symbol.split(":");
    await kite.placeOrder("regular",{
     exchange,
     tradingsymbol,
     transaction_type:"BUY",
     quantity:qty,
     product:"MIS",
     order_type:"MARKET",
     market_protection:2
    });
   }

   state.activeTrades.push({
    symbol:s.symbol,
    strategy:s.strategy,
    entry:s.price,
    qty,
    sl:s.price*0.995,
    target:s.price*1.02
   });
  }

  // EXIT + LEARNING
  state.activeTrades=state.activeTrades.filter(tr=>{
   const cp=lastPrice[tr.symbol];
   if(!cp) return true;

   if(cp>=tr.target||cp<=tr.sl){
    const pnl=(cp-tr.entry)*tr.qty;
    state.pnl+=pnl;
    state.strategies[tr.strategy].pnl+=pnl;

    updateWeights(); // 🔥 learning happens here

    if(LIVE){
     const [exchange,tradingsymbol]=tr.symbol.split(":");
     kite.placeOrder("regular",{
      exchange,
      tradingsymbol,
      transaction_type:"SELL",
      quantity:tr.qty,
      product:"MIS",
      order_type:"MARKET",
      market_protection:2
     });
    }

    state.closedTrades.push({...tr,exit:cp,pnl});
    return false;
   }
   return true;
  });

 }catch(e){
  console.log("ERROR",e.message);
 }
},3000);

// ROUTES
app.get('/',(req,res)=>res.json(state));
app.get('/performance',(req,res)=>res.json(state));

app.listen(PORT,()=>console.log("V24 SELF LEARNING RUNNING"));
