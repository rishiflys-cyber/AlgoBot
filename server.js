
require('dotenv').config();
const express=require('express');
const fs=require('fs');
const axios=require('axios');
const KiteConnect=require("kiteconnect").KiteConnect;

const app=express();
const PORT=process.env.PORT||3000;

const LIVE=process.env.LIVE_TRADING==="true";
const TOKEN_FILE="access_token.json";
const DATA_FILE="trade_data.json";

let kite=new KiteConnect({api_key:process.env.KITE_API_KEY});
let accessToken=null;

if(fs.existsSync(TOKEN_FILE)){
 try{
  const saved=JSON.parse(fs.readFileSync(TOKEN_FILE));
  accessToken=saved.token;
  kite.setAccessToken(accessToken);
 }catch{}
}

// persistent data
let tradeDB = [];
if(fs.existsSync(DATA_FILE)){
 try{
  tradeDB = JSON.parse(fs.readFileSync(DATA_FILE));
 }catch{}
}

let state={
 capital:0,
 pnl:0,
 backtest:{
  trades:0,
  winRate:0,
  expectancy:0
 },
 activeTrades:[],
 closedTrades:[],
 mode:LIVE?"LIVE":"PAPER"
};

let lastPrice={};

// LOGIN
app.get('/login',(req,res)=>res.redirect(kite.getLoginURL()));

app.get('/redirect',async(req,res)=>{
 try{
  const session=await kite.generateSession(req.query.request_token,process.env.KITE_API_SECRET);
  accessToken=session.access_token;
  kite.setAccessToken(accessToken);
  fs.writeFileSync(TOKEN_FILE,JSON.stringify({token:accessToken}));
  res.send("Login success");
 }catch{
  res.send("Login failed");
 }
});

// CAPITAL
async function updateCapital(){
 try{
  const m=await kite.getMargins();
  state.capital=m?.equity?.available?.cash || state.capital;
 }catch{}
}

// STRATEGY (same as before)
function signal(q,prev){
 if(!prev) return false;
 return q.last_price > prev && q.last_price > q.ohlc.open;
}

// EXECUTION
async function executeOrder(sym,qty,side){
 if(!LIVE) return;
 try{
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

// LOOP
setInterval(async()=>{
 try{
  if(!accessToken) return;

  await updateCapital();

  const stocks=["NSE:RELIANCE","NSE:TCS","NSE:INFY"];
  const quotes=await kite.getQuote(stocks);

  for(const sym of stocks){
   const q=quotes[sym];
   if(!q||!q.last_price||!q.ohlc) continue;

   if(signal(q,lastPrice[sym]) && state.activeTrades.length<2){

    const qty=Math.max(1,Math.floor((state.capital*0.01)/q.last_price));

    await executeOrder(sym,qty,"BUY");

    state.activeTrades.push({
     symbol:sym,
     entry:q.last_price,
     qty,
     time:Date.now()
    });
   }

   lastPrice[sym]=q.last_price;
  }

  // EXIT
  state.activeTrades = state.activeTrades.filter(tr=>{
   const cp=lastPrice[tr.symbol];
   if(!cp) return true;

   if(Math.abs(cp-tr.entry)/tr.entry > 0.01){

    const pnl=(cp-tr.entry)*tr.qty;
    state.pnl+=pnl;

    // STORE DATA
    const tradeRecord={
     symbol:tr.symbol,
     entry:tr.entry,
     exit:cp,
     pnl,
     time:Date.now()
    };

    tradeDB.push(tradeRecord);
    fs.writeFileSync(DATA_FILE,JSON.stringify(tradeDB,null,2));

    state.closedTrades.push(tradeRecord);

    executeOrder(tr.symbol,tr.qty,"SELL");

    return false;
   }
   return true;
  });

  // BACKTEST METRICS
  if(tradeDB.length>5){
   const wins=tradeDB.filter(t=>t.pnl>0);
   const losses=tradeDB.filter(t=>t.pnl<=0);

   state.backtest.trades=tradeDB.length;
   state.backtest.winRate=wins.length/tradeDB.length;

   const avgWin=wins.length?wins.reduce((a,b)=>a+b.pnl,0)/wins.length:0;
   const avgLoss=losses.length?losses.reduce((a,b)=>a+b.pnl,0)/losses.length:0;

   state.backtest.expectancy = (state.backtest.winRate*avgWin) + ((1-state.backtest.winRate)*avgLoss);
  }

 }catch(e){
  console.log("ERROR",e.message);
 }
},3000);

// ROUTES
app.get('/',(req,res)=>res.json(state));
app.get('/performance',(req,res)=>res.json(state));
app.get('/backtest',(req,res)=>res.json(state.backtest));

app.listen(PORT,()=>console.log("V19 BACKTEST ENGINE RUNNING"));
