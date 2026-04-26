
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
 const saved=JSON.parse(fs.readFileSync(TOKEN_FILE));
 accessToken=saved.token;
 kite.setAccessToken(accessToken);
}

let state={
 capital:0,
 pnl:0,
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

// alpha
function getScore(q,prev){
 if(!prev) return 0;
 let s=0;
 if(q.last_price>prev) s++;
 if(q.last_price>q.ohlc.open) s++;
 if(q.last_price>q.ohlc.high*0.995) s++;
 if((q.ohlc.high-q.ohlc.low)/q.last_price>0.01) s++;
 return s;
}

// adaptive logic
function adapt(){
 if(tradeHistory.length<10) return;

 const wins=tradeHistory.filter(t=>t.pnl>0);
 const losses=tradeHistory.filter(t=>t.pnl<=0);

 state.winRate=wins.length/(tradeHistory.length||1);
 state.avgWin=wins.length?wins.reduce((a,b)=>a+b.pnl,0)/wins.length:0;
 state.avgLoss=losses.length?losses.reduce((a,b)=>a+b.pnl,0)/losses.length:0;

 // adapt threshold
 if(state.winRate<0.4){
  dynamicThreshold=4; // stricter
 }
 else if(state.winRate>0.6){
  dynamicThreshold=2; // more aggressive
 }
 else{
  dynamicThreshold=3;
 }
}

// execute
async function executeOrder(sym,qty,side){
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
}

// loop
setInterval(async()=>{
 if(!accessToken) return;

 await updateCapital();

 const stocks=["NSE:RELIANCE","NSE:TCS","NSE:INFY","NSE:HDFCBANK"];
 const quotes=await kite.getQuote(stocks);

 for(const sym of stocks){
  const q=quotes[sym];
  if(!q) continue;

  const score=getScore(q,lastPrice[sym]);
  lastPrice[sym]=q.last_price;

  if(score<dynamicThreshold) continue;

  if(state.activeTrades.length>=2) break;

  const qty=Math.max(1,Math.floor((state.capital*0.01)/q.last_price));

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

 // exits
 state.activeTrades=state.activeTrades.filter(tr=>{
  const cp=lastPrice[tr.symbol];
  if(cp>=tr.target||cp<=tr.sl){
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

},3000);

// routes
app.get('/',(req,res)=>res.json(state));
app.get('/performance',(req,res)=>res.json(state));

app.listen(PORT,()=>console.log("ADAPTIVE V16 RUNNING"));
