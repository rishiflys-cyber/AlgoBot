
require("dotenv").config();
const express = require("express");
const fs = require("fs");
const axios = require("axios");
const { KiteConnect } = require("kiteconnect");

const app = express();
const kite = new KiteConnect({ api_key: process.env.KITE_API_KEY });

let access_token=null;
let BOT_ACTIVE=false;
let MANUAL_KILL=false;

let capital=0;
let pnl=0;
let activeTrades=[];

const STATE_FILE = "state.json";

// LOAD STATE
if (fs.existsSync(STATE_FILE)) {
  try {
    const data = JSON.parse(fs.readFileSync(STATE_FILE));
    activeTrades = data.activeTrades || [];
  } catch(e){}
}

// SAVE STATE
function saveState(){
  fs.writeFileSync(STATE_FILE, JSON.stringify({activeTrades}));
}

const STOCKS=["RELIANCE","TCS","INFY","HDFCBANK","ICICIBANK"];

app.get("/",(req,res)=>{
 res.send("BOT RUNNING");
});

// LOGIN WITH IP
app.get("/redirect", async (req, res) => {
  try {
    const s = await kite.generateSession(
      req.query.request_token,
      process.env.KITE_API_SECRET
    );

    access_token = s.access_token;
    kite.setAccessToken(access_token);
    BOT_ACTIVE = true;

    let ip="unknown";
    try{
      const ipRes = await axios.get("https://api.ipify.org?format=json");
      ip = ipRes.data.ip;
    }catch(e){}

    res.send("Login Success. Whitelist IP: " + ip);

  } catch (err) {
    res.send("Login failed");
  }
});

app.get("/start",(req,res)=>{BOT_ACTIVE=true;MANUAL_KILL=false;res.send("STARTED");});
app.get("/kill",(req,res)=>{BOT_ACTIVE=false;MANUAL_KILL=true;res.send("STOPPED");});

setInterval(async()=>{
 if(!access_token || MANUAL_KILL) return;

 try{
  const prices=await kite.getLTP(STOCKS.map(s=>`NSE:${s}`));

  // ENTRY
  for(let s of STOCKS){
    if(activeTrades.find(t=>t.symbol===s)) continue;

    let p=prices[`NSE:${s}`]?.last_price;
    if(!p) continue;

    if(Math.random()>0.7){
      let qty=1;

      await kite.placeOrder("regular",{
        exchange:"NSE",
        tradingsymbol:s,
        transaction_type:"BUY",
        quantity:qty,
        product:"MIS",
        order_type:"MARKET",
        market_protection:2
      });

      activeTrades.push({symbol:s,entry:p,qty,type:"BUY"});
      saveState();
    }
  }

  // EXIT + PNL
  pnl=0;
  let remaining=[];
  for(let t of activeTrades){
    let cp=prices[`NSE:${t.symbol}`]?.last_price;
    if(!cp) continue;

    let profit=(cp-t.entry)*t.qty;
    pnl+=profit;

    if(profit>2 || profit<-2){
      await kite.placeOrder("regular",{
        exchange:"NSE",
        tradingsymbol:t.symbol,
        transaction_type:"SELL",
        quantity:t.qty,
        product:"MIS",
        order_type:"MARKET",
        market_protection:2
      });
    }else{
      remaining.push(t);
    }
  }

  activeTrades=remaining;
  saveState();

 }catch(e){}

},3000);

app.get("/performance",(req,res)=>{
 res.json({
  pnl,
  activeTradesCount: activeTrades.length,
  activeTrades
 });
});

app.listen(process.env.PORT||3000);
