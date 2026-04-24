
require("dotenv").config();
const express = require("express");
const { KiteConnect } = require("kiteconnect");

const app = express();
const kite = new KiteConnect({ api_key: process.env.KITE_API_KEY });

let access_token = null;
let BOT_ACTIVE = false;
let MANUAL_KILL = false;

let capital = 0;
let pnl = 0;

app.get("/", (req,res)=>{
 res.send("BOT LIVE - CHECK /performance");
});

app.get("/login",(req,res)=>res.redirect(kite.getLoginURL()));

app.get("/redirect", async (req,res)=>{
 try{
  const s = await kite.generateSession(req.query.request_token, process.env.KITE_API_SECRET);
  access_token = s.access_token;
  kite.setAccessToken(access_token);
  BOT_ACTIVE = true;
  res.send("Login Success");
 }catch(e){ res.send(e.message); }
});

app.get("/start",(req,res)=>{
 BOT_ACTIVE=true;
 MANUAL_KILL=false;
 res.send("STARTED");
});

app.get("/kill",(req,res)=>{
 BOT_ACTIVE=false;
 MANUAL_KILL=true;
 res.send("STOPPED");
});

// 🔥 FIXED CAPITAL FETCH
async function updateCapital(){
 try{
  let m = await kite.getMargins();

  capital =
    m?.equity?.available?.live_balance ||
    m?.equity?.available?.cash ||
    m?.equity?.net ||
    m?.equity?.available?.opening_balance ||
    0;

  console.log("CAPITAL SYNC:", capital);

 }catch(e){
  console.log("CAPITAL ERROR:", e.message);
 }
}

setInterval(async()=>{
 if(!access_token || MANUAL_KILL) return;

 await updateCapital();

},5000);

app.get("/performance",(req,res)=>{
 res.json({
  capital,
  pnl,
  botActive: BOT_ACTIVE && !MANUAL_KILL
 });
});

app.listen(process.env.PORT||3000);
