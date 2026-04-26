
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
 rankedSignals:[],
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
  state.capital=m?.equity?.available?.cash||state.capital;
 }catch{}
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
    signals.push({
     symbol:sym,
     score,
     price:q.last_price
    });
   }
  }

  // RANKING
  signals.sort((a,b)=>b.score-a.score);

  // TAKE TOP 5 ONLY
  const topSignals=signals.slice(0,5);
  state.rankedSignals=topSignals;

  // EXECUTE ONLY TOP SIGNALS
  for(const s of topSignals){
   if(state.activeTrades.length>=5) break;

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

  // EXIT
  state.activeTrades=state.activeTrades.filter(tr=>{
   const cp=lastPrice[tr.symbol];
   if(!cp) return true;

   if(cp>=tr.target||cp<=tr.sl){
    const pnl=(cp-tr.entry)*tr.qty;
    state.pnl+=pnl;

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

app.listen(PORT,()=>console.log("V22 RANKED SYSTEM RUNNING"));
