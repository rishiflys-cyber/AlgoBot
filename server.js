
require("dotenv").config();
const express = require("express");
const { KiteConnect } = require("kiteconnect");

const app = express();
const kite = new KiteConnect({ api_key: process.env.KITE_API_KEY });

let access_token=null;
let BOT_ACTIVE=false;
let MANUAL_KILL=false;

let capital=0;
let pnl=0;
let activeTrades=[];
let history={};
let scanData=[];

const STOCKS=["RELIANCE","TCS","INFY","HDFCBANK","ICICIBANK","SBIN","ITC","LT"];

app.get("/",(req,res)=>{
 res.send("BOT LIVE - CHECK /performance");
});

app.get("/login",(req,res)=>res.redirect(kite.getLoginURL()));

app.get("/redirect",async(req,res)=>{
 const s=await kite.generateSession(req.query.request_token,process.env.KITE_API_SECRET);
 access_token=s.access_token;
 kite.setAccessToken(access_token);
 BOT_ACTIVE=true;
 res.send("Login Success");
});

app.get("/start",(req,res)=>{BOT_ACTIVE=true;MANUAL_KILL=false;res.send("STARTED");});
app.get("/kill",(req,res)=>{BOT_ACTIVE=false;MANUAL_KILL=true;res.send("STOPPED");});

async function updateCapital(){
 try{
  let m=await kite.getMargins();
  capital=m?.equity?.available?.live_balance||m?.equity?.available?.cash||m?.equity?.net||0;
 }catch(e){}
}

function prob(a){
 if(a.length<5) return 0;
 let up=0;
 for(let i=1;i<a.length;i++){ if(a[i]>a[i-1]) up++; }
 return up/a.length;
}

function momentum(a){
 if(a.length<3) return 0;
 return a[a.length-1] - a[0];
}

setInterval(async()=>{
 if(!access_token||MANUAL_KILL) return;

 try{
  await updateCapital();
  const prices=await kite.getLTP(STOCKS.map(s=>`NSE:${s}`));
  scanData=[];

  for(let s of STOCKS){

    let p=prices[`NSE:${s}`].last_price;

    if(!history[s]) history[s]=[];
    history[s].push(p);
    if(history[s].length>8) history[s].shift();

    let pr=prob(history[s]);
    let mom=momentum(history[s]);

    let signal=null;
    let sizeFactor=0;

    // CORE TRADE
    if(pr>=0.55 && Math.abs(mom)>(p*0.002)){
        signal = mom>0?"BUY":"SELL";
        sizeFactor=1;
    }

    // SCOUT TRADE
    else if(pr>=0.42 && Math.abs(mom)>(p*0.001)){
        signal = mom>0?"BUY":"SELL";
        sizeFactor=0.4;
    }

    let mode = sizeFactor===1?"CORE":sizeFactor===0.4?"SCOUT":"NONE";

    scanData.push({symbol:s,price:p,signal,probability:pr,mode});

    if(signal && activeTrades.length<3){

        let baseQty = Math.max(1, Math.floor(capital/(p*25)));
        let qty = Math.max(1, Math.floor(baseQty * sizeFactor));

        console.log("TRY:",s,signal,qty,mode);

        try{
            await kite.placeOrder("regular",{
                exchange:"NSE",
                tradingsymbol:s,
                transaction_type:signal,
                quantity:qty,
                product:"MIS",
                order_type:"MARKET"
            });

            activeTrades.push({symbol:s,entry:p,type:signal});
        }catch(e){
            console.log("FAIL:",e.message);
        }
    }
  }

  pnl=0;
  for(let t of activeTrades){
    let cp=prices[`NSE:${t.symbol}`].last_price;
    pnl += t.type==="BUY"?(cp-t.entry):(t.entry-cp);
  }

 }catch(e){
  console.log("ERR",e.message);
 }

},3000);

app.get("/performance",(req,res)=>{
 res.json({
  capital,
  pnl,
  botActive: BOT_ACTIVE && !MANUAL_KILL,
  activeTradesCount: activeTrades.length,
  scan: scanData
 });
});

app.listen(process.env.PORT||3000);
