
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
let trades = [];
let position = null;

const SYMBOL = "RELIANCE";
const EXCHANGE = "NSE";
const PRODUCT = "MIS";

app.get("/login", (req,res)=> res.redirect(kite.getLoginURL()));

app.get("/redirect", async (req,res)=>{
  try {
    const session = await kite.generateSession(req.query.request_token, process.env.KITE_API_SECRET);
    access_token = session.access_token;
    kite.setAccessToken(access_token);
    res.send("Login Success ✅ REAL MODE");
  } catch(e){
    res.send("Login Failed ❌");
  }
});

app.get("/start",(req,res)=>{ BOT_ACTIVE=true; res.send("🚀 BOT STARTED"); });
app.get("/kill",(req,res)=>{ BOT_ACTIVE=false; res.send("🛑 BOT STOPPED"); });

// FINAL CAPITAL FIX (NET + HOLDINGS)
app.get("/dashboard", async (req,res)=>{
  let capital = 0;

  try {
    const margins = await kite.getMargins();
    capital = margins?.equity?.net || 0;
  } catch(e) {
    console.log("Margins failed");
  }

  try {
    const holdings = await kite.getHoldings();
    const holdingValue = holdings.reduce((sum,h)=> sum + (h.last_price * h.quantity), 0);
    capital += holdingValue;
  } catch(e) {
    console.log("Holdings failed");
  }

  res.json({ capital, trades, position });
});

app.get("/",(req,res)=>res.sendFile(path.join(__dirname,"public/index.html")));

app.listen(process.env.PORT || 8080,()=>console.log("FINAL BOT RUNNING"));
