
require("dotenv").config();
const express = require("express");
const path = require("path");
const { KiteConnect } = require("kiteconnect");

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const kite = new KiteConnect({ api_key: process.env.KITE_API_KEY });

let access_token = null;
let BOT_ACTIVE = false;
let position = null;
let tradesToday = 0;
let pnl = 0;

console.log("🚀 FINAL ONE FIX");

// LOGIN
app.get("/login",(req,res)=>res.redirect(kite.getLoginURL()));

app.get("/redirect", async (req,res)=>{
 try{
  const session = await kite.generateSession(req.query.request_token, process.env.KITE_API_SECRET);
  access_token = session.access_token;
  kite.setAccessToken(access_token);
  res.send("Login Success ✅");
 }catch{
  res.send("Login Failed ❌");
 }
});

// CONTROL
app.get("/start",(req,res)=>{BOT_ACTIVE=true;res.send("STARTED")});
app.get("/kill",(req,res)=>{BOT_ACTIVE=false;res.send("STOPPED")});

// DASHBOARD (FIXED CAPITAL)
app.get("/dashboard", async (req,res)=>{
 let capital = 0;
 try{
  if(access_token){
    const m = await kite.getMargins();
    capital = m?.equity?.net || 0;
  }
 }catch{}
 res.json({capital,BOT_ACTIVE,position,tradesToday,pnl});
});

// PORT
const PORT = process.env.PORT || 3000;
app.listen(PORT, ()=>console.log("Server running on", PORT));
