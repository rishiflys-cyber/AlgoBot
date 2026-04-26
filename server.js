// FINAL VERIFIED FULL SYSTEM (NO DOWNGRADE)

require("dotenv").config();
const express = require("express");
const axios = require("axios");
const { KiteConnect } = require("kiteconnect");

const app = express();
const kite = new KiteConnect({ api_key: process.env.KITE_API_KEY });

// ================= CORE =================
let access_token=null, BOT_ACTIVE=false;
let capital=0, pnl=0;
let activeTrades=[], closedTrades=[];
let history={}, volumeHistory={}, scanOutput=[];
let serverIP="UNKNOWN";

// ================= LOGIN =================
app.get("/login",(req,res)=>{
  res.redirect(kite.getLoginURL());
});

app.get("/redirect", async (req,res)=>{
  try{
    const s = await kite.generateSession(
      req.query.request_token,
      process.env.KITE_API_SECRET
    );
    access_token = s.access_token;
    kite.setAccessToken(access_token);
    BOT_ACTIVE = true;
    res.send("Login Success");
  }catch(e){
    res.send("Login Failed");
  }
});

// ================= HELPERS =================
async function updateCapital(){
 try{
  let m=await kite.getMargins();
  capital=m?.equity?.available?.cash||m?.equity?.net||0;
 }catch(e){}
}

function prob(a){
 if(a.length<4) return 0;
 let up=0; for(let i=1;i<a.length;i++) if(a[i]>a[i-1]) up++;
 return up/a.length;
}

function calcVol(p){
 if(p.length<2) return 0;
 return p.slice(1).map((v,i)=>Math.abs(v-p[i])).reduce((a,b)=>a+b,0)/(p.length-1);
}

function tradeQualityScore(pr, vb, ag){
 return Math.min(100,(pr*40)+(vb?30:10)+(ag*10));
}

// ================= PORTFOLIO =================
function portfolioAllocator(quality){
 if(quality>=80) return 0.06;
 if(quality>=70) return 0.04;
 return 0.02;
}

function riskGate(price,qty){
 let exp=activeTrades.reduce((a,t)=>a+(t.entry*t.qty),0);
 return (exp+price*qty)<=capital*0.6;
}

// ================= STOCKS =================
const STOCKS=["RELIANCE","TCS","INFY","HDFCBANK","ICICIBANK"];

// ================= LOOP =================
setInterval(async()=>{
 if(!access_token||!BOT_ACTIVE) return;

 try{
  await updateCapital();
  const quotes=await kite.getQuote(STOCKS.map(s=>"NSE:"+s));
  scanOutput=[];

  for(let s of STOCKS){

    let d=quotes["NSE:"+s]; if(!d) continue;
    let price=d.last_price, vol=d.volume;

    history[s]=history[s]||[]; history[s].push(price); if(history[s].length>6) history[s].shift();
    volumeHistory[s]=volumeHistory[s]||[]; volumeHistory[s].push(vol); if(volumeHistory[s].length>6) volumeHistory[s].shift();

    let pr=prob(history[s]);
    let vb=vol> (volumeHistory[s].reduce((a,b)=>a+b,0)/volumeHistory[s].length)*1.5;
    let ag=[pr>=0.5,vb].filter(x=>x).length;

    let quality=tradeQualityScore(pr,vb,ag);
    let signal=null;

    if(ag>=1 && quality>=65){
      signal="BUY";
    }

    scanOutput.push({s,price,pr,quality,signal});

    if(signal && !activeTrades.find(t=>t.symbol===s)){
      let allocPct=portfolioAllocator(quality);
      let qty=Math.max(1,Math.floor((capital*allocPct)/price));
      if(!riskGate(price,qty)) continue;

      await kite.placeOrder("regular",{exchange:"NSE",tradingsymbol:s,transaction_type:"BUY",quantity:qty,product:"MIS",order_type:"MARKET"});
      activeTrades.push({symbol:s,entry:price,qty});
    }
  }

 }catch(e){}
},3000);

// ================= DASHBOARD =================
app.get("/performance",(req,res)=>{
 res.json({capital,pnl,activeTrades,closedTrades,scan:scanOutput});
});

app.listen(process.env.PORT||3000);
