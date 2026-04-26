
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
 regime:"UNKNOWN",
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

let lastPrices=[];

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
  state.capital = m?.equity?.available?.cash || m?.equity?.net || state.capital;
 }catch{}
}

// REGIME DETECTION
function detectRegime(price){
 lastPrices.push(price);
 if(lastPrices.length>20) lastPrices.shift();

 if(lastPrices.length<20) return "UNKNOWN";

 let trend = lastPrices[lastPrices.length-1] - lastPrices[0];
 let volatility = Math.max(...lastPrices) - Math.min(...lastPrices);

 if(Math.abs(trend) > volatility*0.6){
  return "TREND";
 } else {
  return "SIDEWAYS";
 }
}

// ADAPT STRATEGY WEIGHTS BASED ON REGIME
function applyRegimeWeights(regime){
 if(regime==="TREND"){
  state.strategies.momentum.weight=0.6;
  state.strategies.breakout.weight=0.3;
  state.strategies.meanReversion.weight=0.1;
 }
 else if(regime==="SIDEWAYS"){
  state.strategies.momentum.weight=0.2;
  state.strategies.breakout.weight=0.2;
  state.strategies.meanReversion.weight=0.6;
 }
}

// STRATEGY DETECTION
function detectStrategy(q,prev){
 if(!prev||!q.ohlc) return null;

 if(q.last_price>prev) return "momentum";
 if(q.last_price>q.ohlc.high*0.995) return "breakout";
 if(q.last_price<q.ohlc.low*1.005) return "meanReversion";

 return null;
}

// MAIN LOOP
setInterval(async()=>{
 try{
  if(!accessToken) return;

  await updateCapital();

  const stocks=["NSE:NIFTY 50"]; // using index for regime
  const q=await kite.getQuote(stocks);
  const price=q["NSE:NIFTY 50"]?.last_price;

  if(price){
   state.regime = detectRegime(price);
   applyRegimeWeights(state.regime);
  }

  const universe=[
   "NSE:RELIANCE","NSE:TCS","NSE:INFY","NSE:HDFCBANK","NSE:ICICIBANK",
   "NSE:SBIN","NSE:AXISBANK","NSE:KOTAKBANK","NSE:ITC","NSE:LT"
  ];

  const quotes=await kite.getQuote(universe);

  let signals=[];

  for(const sym of universe){
   const q=quotes[sym];
   if(!q||!q.last_price) continue;

   const strategy=detectStrategy(q,lastPrices[lastPrices.length-2]);

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

 }catch(e){
  console.log("ERROR",e.message);
 }
},3000);

// ROUTES
app.get('/',(req,res)=>res.json(state));
app.get('/performance',(req,res)=>res.json(state));

app.listen(PORT,()=>console.log("V25 REGIME SYSTEM RUNNING"));
