// STEP 1: SIGNAL + QUALITY ENGINE (NO DOWNGRADE)

require("dotenv").config();
const express = require("express");
const axios = require("axios");
const { KiteConnect } = require("kiteconnect");

const app = express();
const kite = new KiteConnect({ api_key: process.env.KITE_API_KEY });

// CORE
let access_token=null, BOT_ACTIVE=false;
let capital=0, pnl=0;
let activeTrades=[], closedTrades=[];
let history={}, volumeHistory={}, scanOutput=[];

// LOGIN
app.get("/login",(req,res)=> res.redirect(kite.getLoginURL()));

app.get("/redirect", async (req,res)=>{
 try{
  const s=await kite.generateSession(req.query.request_token,process.env.KITE_API_SECRET);
  access_token=s.access_token;
  kite.setAccessToken(access_token);
  BOT_ACTIVE=true;
  res.send("Login Success");
 }catch(e){ res.send("Login Failed"); }
});

// HELPERS
async function updateCapital(){
 try{
  let m=await kite.getMargins();
  capital=m?.equity?.available?.cash||m?.equity?.net||0;
 }catch(e){}
}

function prob(arr){
 if(arr.length<4) return 0;
 let up=0;
 for(let i=1;i<arr.length;i++) if(arr[i]>arr[i-1]) up++;
 return up/arr.length;
}

function volumeBreakout(symbol, vol){
 if(!volumeHistory[symbol]) return false;
 let avg=volumeHistory[symbol].reduce((a,b)=>a+b,0)/volumeHistory[symbol].length;
 return vol>avg*1.5;
}

// STEP 1 ADDITION
function tradeQualityScore(pr, volBreak, agreement){
 return Math.min(100,(pr*40)+(volBreak?30:10)+(agreement*10));
}

// STOCKS
const STOCKS=["RELIANCE","TCS","INFY","HDFCBANK","ICICIBANK"];

// LOOP
setInterval(async()=>{
 if(!access_token||!BOT_ACTIVE) return;

 try{
  await updateCapital();
  const quotes=await kite.getQuote(STOCKS.map(s=>"NSE:"+s));
  scanOutput=[];

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
    let volBreak=volumeBreakout(s,vol);

    let momentum = pr>=0.5;
    let agreement = [momentum, volBreak].filter(x=>x).length;

    let quality = tradeQualityScore(pr, volBreak, agreement);

    let signal=null;

    if(agreement>=1 && pr>=0.5 && quality>=65){
      signal="BUY";
    }

    scanOutput.push({
      symbol:s,
      price,
      probability:pr,
      volume:vol,
      volumeBreakout:volBreak,
      agreement,
      quality,
      signal
    });

    if(signal && !activeTrades.find(t=>t.symbol===s)){
      let qty=Math.max(1,Math.floor((capital*0.02)/price));

      await kite.placeOrder("regular",{
        exchange:"NSE",
        tradingsymbol:s,
        transaction_type:"BUY",
        quantity:qty,
        product:"MIS",
        order_type:"MARKET"
      });

      activeTrades.push({symbol:s,entry:price,qty});
    }
  }

 }catch(e){}
},3000);

// DASHBOARD
app.get("/performance",(req,res)=>{
 res.json({capital,pnl,activeTrades,closedTrades,scan:scanOutput});
});

app.listen(process.env.PORT||3000);
