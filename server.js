
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
 }catch{}
}

let state={
 capital:0,
 pnl:0,
 regime:"UNKNOWN",
 strategies:{
  momentum:{weight:0.4, pnl:0},
  breakout:{weight:0.3, pnl:0},
  meanReversion:{weight:0.3, pnl:0}
 },
 activeTrades:[],
 closedTrades:[],
 serverIP:null,
 mode:LIVE?"LIVE":"PAPER"
};

let lastPrice={};

// login
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
  res.send("Login failed");
 }
});

// capital
async function updateCapital(){
 try{
  const m=await kite.getMargins();
  state.capital=m?.equity?.available?.cash||state.capital;
 }catch{}
}

// strategies
function momentum(q,prev){
 if(!prev) return 0;
 return q.last_price>prev ? 1 : 0;
}

function breakout(q){
 if(!q.ohlc) return 0;
 return q.last_price > q.ohlc.high*0.995 ? 1 : 0;
}

function meanReversion(q){
 if(!q.ohlc) return 0;
 return q.last_price < q.ohlc.low*1.005 ? 1 : 0;
}

// execution
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
 }catch{}
}

// loop
setInterval(async()=>{
 try{
  if(!accessToken) return;

  await updateCapital();

  const stocks=["NSE:RELIANCE","NSE:TCS","NSE:INFY","NSE:HDFCBANK"];
  const quotes=await kite.getQuote(stocks);

  for(const sym of stocks){
   const q=quotes[sym];
   if(!q||!q.last_price) continue;

   const m=momentum(q,lastPrice[sym]);
   const b=breakout(q);
   const r=meanReversion(q);

   lastPrice[sym]=q.last_price;

   let strategy=null;

   if(m && state.strategies.momentum.weight>0.3) strategy="momentum";
   else if(b) strategy="breakout";
   else if(r) strategy="meanReversion";

   if(!strategy) continue;

   if(state.activeTrades.length>=3) break;

   const alloc=state.capital * state.strategies[strategy].weight;
   const qty=Math.max(1,Math.floor((alloc*0.02)/q.last_price));

   await executeOrder(sym,qty,"BUY");

   state.activeTrades.push({
    symbol:sym,
    strategy,
    entry:q.last_price,
    qty,
    sl:q.last_price*0.995,
    target:q.last_price*1.02
   });
  }

  // exit
  state.activeTrades=state.activeTrades.filter(tr=>{
   const cp=lastPrice[tr.symbol];
   if(!cp) return true;

   if(cp>=tr.target||cp<=tr.sl){
    const pnl=(cp-tr.entry)*tr.qty;
    state.pnl+=pnl;
    state.strategies[tr.strategy].pnl+=pnl;

    executeOrder(tr.symbol,tr.qty,"SELL");

    state.closedTrades.push({...tr,exit:cp,pnl});
    return false;
   }
   return true;
  });

  // rebalance weights (simple adaptive)
  let totalPnl=Object.values(state.strategies).reduce((a,b)=>a+b.pnl,0)||1;

  for(let key in state.strategies){
   state.strategies[key].weight = Math.max(0.1, state.strategies[key].pnl/totalPnl);
  }

 }catch(e){
  console.log("LOOP ERROR",e.message);
 }
},3000);

// routes
app.get('/',(req,res)=>res.json(state));
app.get('/performance',(req,res)=>res.json(state));

app.listen(PORT,()=>console.log("PORTFOLIO V18 RUNNING"));
