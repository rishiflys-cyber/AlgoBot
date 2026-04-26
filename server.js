
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
 rankedSignals:[],
 activeTrades:[],
 closedTrades:[],
 serverIP:null,
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
  state.serverIP=ip.data.ip;

  await updateCapital();

  res.send("Login success | IP: "+state.serverIP+" | Capital: "+state.capital);
 }catch(e){
  res.send("Login failed");
 }
});

// CAPITAL FIX (CRITICAL)
async function updateCapital(){
 try{
  const m=await kite.getMargins();
  state.capital =
    m?.equity?.available?.cash ||
    m?.equity?.net ||
    m?.commodity?.available?.cash ||
    state.capital;
 }catch(e){
  console.log("CAPITAL ERROR",e.message);
 }
}

// SCORE ENGINE
function scoreStock(q,prev){
 if(!prev||!q.ohlc) return 0;
 let score=0;

 if(q.last_price>prev) score+=1;
 if(q.last_price>q.ohlc.open) score+=1;
 if(q.last_price>q.ohlc.high*0.995) score+=2;
 if((q.ohlc.high-q.ohlc.low)/q.last_price>0.01) score+=1;

 return score;
}

// MAIN LOOP
setInterval(async()=>{
 try{
  if(!accessToken) return;

  await updateCapital();

  const stocks=[
   "NSE:RELIANCE","NSE:TCS","NSE:INFY","NSE:HDFCBANK","NSE:ICICIBANK",
   "NSE:LT","NSE:SBIN","NSE:AXISBANK","NSE:KOTAKBANK","NSE:ITC"
  ];

  const quotes=await kite.getQuote(stocks);

  let signals=[];

  for(const sym of stocks){
   const q=quotes[sym];
   if(!q||!q.last_price) continue;

   const score=scoreStock(q,lastPrice[sym]);
   lastPrice[sym]=q.last_price;

   if(score>0){
    signals.push({symbol:sym,score,price:q.last_price});
   }
  }

  signals.sort((a,b)=>b.score-a.score);
  const top=signals.slice(0,5);

  state.rankedSignals=top;

  for(const s of top){
   if(state.activeTrades.length>=5) break;

   if(state.capital<=0) continue;

   const qty=Math.max(1,Math.floor((state.capital*0.02)/s.price));

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
    entry:s.price,
    qty,
    sl:s.price*0.995,
    target:s.price*1.02,
    score:s.score
   });
  }

 }catch(e){
  console.log("ERROR",e.message);
 }
},3000);

// ROUTES
app.get('/',(req,res)=>res.json(state));
app.get('/performance',(req,res)=>res.json(state));

app.listen(PORT,()=>console.log("V23 FIXED RUNNING"));
