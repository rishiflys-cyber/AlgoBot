
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

const STOCKS = ['RELIANCE', 'TCS', 'INFY', 'HDFCBANK', 'ICICIBANK', 'SBIN', 'ITC', 'LT', 'AXISBANK', 'KOTAKBANK', 'HCLTECH', 'WIPRO', 'BHARTIARTL', 'HINDUNILVR', 'TATASTEEL', 'JSWSTEEL', 'MARUTI', 'BAJFINANCE', 'POWERGRID', 'NTPC', 'ONGC', 'COALINDIA', 'ULTRACEMCO', 'ASIANPAINT', 'SUNPHARMA', 'DRREDDY', 'CIPLA', 'DIVISLAB', 'ADANIPORTS', 'ADANIENT', 'GRASIM', 'TECHM', 'HEROMOTOCO', 'EICHERMOT', 'BRITANNIA', 'NESTLEIND', 'INDUSINDBK', 'BAJAJFINSV', 'SHREECEM', 'APOLLOHOSP', 'TITAN', 'UPL', 'HDFCLIFE', 'SBILIFE', 'ICICIPRULI', 'DLF', 'GODREJCP', 'PIDILITIND', 'BERGEPAINT', 'DABUR', 'MCDOWELL-N', 'AMBUJACEM', 'ACC', 'VEDL', 'SAIL', 'NMDC', 'HINDALCO', 'PAGEIND', 'COLPAL', 'MARICO', 'TORNTPHARM', 'LUPIN', 'AUROPHARMA', 'BIOCON', 'ALKEM', 'ZYDUSLIFE', 'RELIANCE', 'TCS', 'INFY', 'HDFCBANK', 'ICICIBANK', 'SBIN', 'ITC', 'LT', 'AXISBANK', 'KOTAKBANK', 'HCLTECH', 'WIPRO', 'BHARTIARTL', 'HINDUNILVR', 'TATASTEEL', 'JSWSTEEL', 'MARUTI', 'BAJFINANCE', 'POWERGRID', 'NTPC', 'ONGC', 'COALINDIA', 'ULTRACEMCO', 'ASIANPAINT', 'SUNPHARMA', 'DRREDDY', 'CIPLA', 'DIVISLAB', 'ADANIPORTS', 'ADANIENT', 'GRASIM', 'TECHM', 'HEROMOTOCO', 'EICHERMOT', 'BRITANNIA', 'NESTLEIND', 'INDUSINDBK', 'BAJAJFINSV', 'SHREECEM', 'APOLLOHOSP', 'TITAN', 'UPL', 'HDFCLIFE', 'SBILIFE', 'ICICIPRULI', 'DLF', 'GODREJCP', 'PIDILITIND', 'BERGEPAINT', 'DABUR', 'MCDOWELL-N', 'AMBUJACEM', 'ACC', 'VEDL', 'SAIL', 'NMDC', 'HINDALCO', 'PAGEIND', 'COLPAL', 'MARICO', 'TORNTPHARM', 'LUPIN', 'AUROPHARMA', 'BIOCON', 'ALKEM', 'ZYDUSLIFE', 'RELIANCE', 'TCS', 'INFY', 'HDFCBANK', 'ICICIBANK', 'SBIN', 'ITC', 'LT', 'AXISBANK', 'KOTAKBANK', 'HCLTECH', 'WIPRO', 'BHARTIARTL', 'HINDUNILVR', 'TATASTEEL', 'JSWSTEEL', 'MARUTI', 'BAJFINANCE', 'POWERGRID', 'NTPC', 'ONGC', 'COALINDIA', 'ULTRACEMCO', 'ASIANPAINT', 'SUNPHARMA', 'DRREDDY', 'CIPLA', 'DIVISLAB', 'ADANIPORTS', 'ADANIENT', 'GRASIM', 'TECHM', 'HEROMOTOCO', 'EICHERMOT', 'BRITANNIA', 'NESTLEIND', 'INDUSINDBK', 'BAJAJFINSV', 'SHREECEM', 'APOLLOHOSP', 'TITAN', 'UPL', 'HDFCLIFE', 'SBILIFE', 'ICICIPRULI', 'DLF', 'GODREJCP', 'PIDILITIND', 'BERGEPAINT', 'DABUR', 'MCDOWELL-N', 'AMBUJACEM', 'ACC', 'VEDL', 'SAIL', 'NMDC', 'HINDALCO', 'PAGEIND', 'COLPAL', 'MARICO', 'TORNTPHARM', 'LUPIN', 'AUROPHARMA', 'BIOCON', 'ALKEM', 'ZYDUSLIFE'];

app.get("/",(req,res)=>res.send("200+ STOCK BOT LIVE"));

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
 if(a.length<4) return 0;
 let up=0;
 for(let i=1;i<a.length;i++) if(a[i]>a[i-1]) up++;
 return up/a.length;
}

setInterval(async()=>{
 if(!access_token||MANUAL_KILL) return;

 try{
  await updateCapital();
  const prices=await kite.getLTP(STOCKS.map(s=>`NSE:${s}`));
  scanData=[];

  let activeList=[];

  for(let s of STOCKS){
    let p=prices[`NSE:${s}`]?.last_price;
    if(!p) continue;

    if(!history[s]) history[s]=[];
    history[s].push(p);
    if(history[s].length>5) history[s].shift();

    if(history[s].length>=3){
      let change=(p-history[s][0])/history[s][0];
      if(Math.abs(change)>0.003){
        activeList.push(s);
      }
    }
  }

  for(let s of activeList){
    let p=prices[`NSE:${s}`].last_price;
    let pr=prob(history[s]);

    let signal=null;
    if(pr>=0.5){
      let last=history[s].at(-1);
      let prev=history[s].at(-2);
      signal=last>prev?"BUY":"SELL";
    }

    scanData.push({symbol:s,price:p,signal,probability:pr});

    if(signal && activeTrades.length<3){
      let qty=Math.max(1,Math.floor(capital/(p*25)));

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
      }catch(e){}
    }
  }

 }catch(e){}

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
