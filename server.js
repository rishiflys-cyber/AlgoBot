
require('dotenv').config();
const express=require('express');
const fs=require('fs');
const KiteConnect=require("kiteconnect").KiteConnect;

const app=express();
const PORT=process.env.PORT||3000;

const LIVE=process.env.LIVE_TRADING==="true";
const TOKEN_FILE="access_token.json";

let kite=new KiteConnect({api_key:process.env.KITE_API_KEY});
let accessToken=null;

let state={
 capital:0,
 executionStats:{
  totalTrades:0,
  avgSlippage:0,
  avgLatency:0,
  slippages:[],
  latencies:[]
 },
 activeTrades:[],
 mode:LIVE?"LIVE":"PAPER"
};

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
  res.send("Login success");
 }catch{
  res.send("Login failed");
 }
});

// CAPITAL
async function updateCapital(){
 try{
  const m=await kite.getMargins();
  state.capital=m?.equity?.available?.cash||state.capital;
 }catch{}
}

// REAL EXECUTION WITH ORDERBOOK
async function executeOrder(sym, qty, side, expectedPrice){
 const start=Date.now();

 if(!LIVE) return expectedPrice;

 try{
  const [exchange,tradingsymbol]=sym.split(":");

  const orderId = await kite.placeOrder("regular",{
   exchange,
   tradingsymbol,
   transaction_type:side,
   quantity:qty,
   product:"MIS",
   order_type:"MARKET",
   market_protection:2
  });

  // fetch orderbook
  const orders = await kite.getOrders();
  const order = orders.find(o=>o.order_id===orderId);

  const end=Date.now();
  const latency=end-start;

  let executedPrice = order?.average_price || expectedPrice;

  let slippage = (executedPrice - expectedPrice) / expectedPrice;

  state.executionStats.totalTrades++;
  state.executionStats.slippages.push(slippage);
  state.executionStats.latencies.push(latency);

  state.executionStats.avgSlippage =
    state.executionStats.slippages.reduce((a,b)=>a+b,0) /
    state.executionStats.slippages.length;

  state.executionStats.avgLatency =
    state.executionStats.latencies.reduce((a,b)=>a+b,0) /
    state.executionStats.latencies.length;

  return executedPrice;

 }catch(e){
  console.log("REAL EXEC ERROR",e.message);
  return expectedPrice;
 }
}

// LOOP
setInterval(async()=>{
 try{
  if(!accessToken) return;

  await updateCapital();

  const stocks=["NSE:RELIANCE","NSE:TCS"];
  const quotes=await kite.getQuote(stocks);

  for(const sym of stocks){
   const q=quotes[sym];
   if(!q||!q.last_price) continue;

   if(state.activeTrades.length>=2) break;

   const price=q.last_price;
   const qty=Math.max(1,Math.floor((state.capital*0.02)/price));

   const execPrice = await executeOrder(sym,qty,"BUY",price);

   state.activeTrades.push({
    symbol:sym,
    entry:execPrice,
    qty
   });
  }

 }catch(e){
  console.log("ERROR",e.message);
 }
},3000);

// ROUTES
app.get('/',(req,res)=>res.json(state));
app.get('/execution',(req,res)=>res.json(state.executionStats));

app.listen(PORT,()=>console.log("V28 REAL EXECUTION RUNNING"));
