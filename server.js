
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

if(fs.existsSync(TOKEN_FILE)){
 try{
  const saved=JSON.parse(fs.readFileSync(TOKEN_FILE));
  accessToken=saved.token;
  kite.setAccessToken(accessToken);
 }catch(e){ console.log("TOKEN LOAD ERROR"); }
}

let state={
 capital:0,
 pnl:0,
 regime:"UNKNOWN",
 activeTrades:[],
 closedTrades:[],
 winRate:0,
 avgWin:0,
 avgLoss:0,
 serverIP:null,
 mode:LIVE?"LIVE":"PAPER"
};

let tradeHistory=[];
let lastPrice={};
let dynamicThreshold=3;

// LOGIN
app.get('/login',(req,res)=>res.redirect(kite.getLoginURL()));

app.get('/redirect',async(req,res)=>{
 try{
  const session=await kite.generateSession(req.query.request_token,process.env.KITE_API_SECRET);
  accessToken=session.access_token;
  kite.setAccessToken(accessToken);
  fs.writeFileSync(TOKEN_FILE,JSON.stringify({token:accessToken}));

  const ip=await axios.get("https://api.ipify.org?format=json");
  state.serverIP=ip.data.ip;

  res.send("Login success | IP: "+state.serverIP);
 }catch(e){
  console.log("LOGIN ERROR:",e.message);
  res.send("Login failed");
 }
});

// CAPITAL SAFE
async function updateCapital(){
 try{
  const m=await kite.getMargins();
  state.capital=m?.equity?.available?.cash || m?.equity?.net || state.capital;
 }catch(e){
  console.log("MARGIN ERROR:",e.message);
 }
}

// REGIME SAFE
function detectRegime(q){
 try{
  const range=(q.ohlc.high - q.ohlc.low)/q.last_price;
  if(range>0.015) return "TRENDING";
  if(range<0.007) return "SIDEWAYS";
  return "NORMAL";
 }catch{ return "NORMAL"; }
}

// SCORE SAFE
function getScore(q,prev){
 if(!prev) return 0;
 let s=0;
 if(q.last_price>prev) s++;
 if(q.ohlc && q.last_price>q.ohlc.open) s++;
 if(q.ohlc && q.last_price>q.ohlc.high*0.995) s++;
 if(q.ohlc && (q.ohlc.high-q.ohlc.low)/q.last_price>0.01) s++;
 return s;
}

// ADAPTIVE SAFE
function adapt(){
 if(tradeHistory.length<10) return;

 const wins=tradeHistory.filter(t=>t.pnl>0);
 const losses=tradeHistory.filter(t=>t.pnl<=0);

 state.winRate=wins.length/(tradeHistory.length||1);
 state.avgWin=wins.length?wins.reduce((a,b)=>a+b.pnl,0)/wins.length:0;
 state.avgLoss=losses.length?losses.reduce((a,b)=>a+b.pnl,0)/losses.length:0;

 if(state.winRate<0.4) dynamicThreshold=4;
 else if(state.winRate>0.6) dynamicThreshold=2;
 else dynamicThreshold=3;
}

// EXECUTION SAFE
async function executeOrder(sym,qty,side){
 try{
  if(!LIVE) return;
  const [exchange,tradingsymbol]=sym.split(":");
  await kite.placeOrder("regular",{
   exchange,
   tradingsymbol,
   transaction_type:side,
   quantity:qty,
   product:"MIS",
   order_type:"MARKET",
   market_protection:2
  });
 }catch(e){
  console.log("ORDER ERROR:",e.message);
 }
}

// MAIN LOOP SAFE
setInterval(async()=>{
 try{
  if(!accessToken) return;

  await updateCapital();

  const stocks=["NSE:RELIANCE","NSE:TCS","NSE:INFY","NSE:HDFCBANK"];
  const quotes=await kite.getQuote(stocks);

  for(const sym of stocks){
   const q=quotes[sym];
   if(!q || !q.last_price) continue;

   state.regime=detectRegime(q);

   const score=getScore(q,lastPrice[sym]);
   lastPrice[sym]=q.last_price;

   if(state.regime==="SIDEWAYS" && score<4) continue;
   if(state.regime==="TRENDING" && score<2) continue;
   if(state.regime==="NORMAL" && score<dynamicThreshold) continue;

   if(state.activeTrades.length>=2) break;

   const qty=Math.max(1,Math.floor((state.capital*0.01)/q.last_price));
   if(qty<=0) continue;

   await executeOrder(sym,qty,"BUY");

   state.activeTrades.push({
    symbol:sym,
    entry:q.last_price,
    qty,
    sl:q.last_price*0.995,
    target:q.last_price*1.02,
    score
   });
  }

  // EXIT SAFE
  state.activeTrades=state.activeTrades.filter(tr=>{
   const cp=lastPrice[tr.symbol];
   if(!cp) return true;

   if(cp>=tr.target || cp<=tr.sl){
    const pnl=(cp-tr.entry)*tr.qty;
    state.pnl+=pnl;

    tradeHistory.push({pnl,score:tr.score});
    adapt();

    executeOrder(tr.symbol,tr.qty,"SELL");

    state.closedTrades.push({...tr,exit:cp,pnl});
    return false;
   }
   return true;
  });

 }catch(e){
  console.log("LOOP ERROR:",e.message);
 }
},3000);

// ROUTES
app.get('/',(req,res)=>res.json(state));
app.get('/performance',(req,res)=>res.json(state));

app.listen(PORT,()=>console.log("V17 FIXED RUNNING"));
