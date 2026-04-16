
// 7.5 FIXED REAL VERSION
require("dotenv").config();
const express = require("express");
const fs = require("fs");
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

const STOCKS = ["RELIANCE","TCS","INFY","HDFCBANK","ICICIBANK","SBIN","LT","ITC","HINDUNILVR","AXISBANK"];

const SL = 0.02;
const TP = 0.03;

app.get("/login",(req,res)=>res.redirect(kite.getLoginURL()));

app.get("/redirect", async (req,res)=>{
 const session = await kite.generateSession(req.query.request_token, process.env.KITE_API_SECRET);
 access_token = session.access_token;
 kite.setAccessToken(access_token);
 res.send("Login Success - FIXED");
});

app.get("/start",(req,res)=>{BOT_ACTIVE=true;res.send("STARTED")});
app.get("/kill",(req,res)=>{BOT_ACTIVE=false;res.send("STOPPED")});

app.get("/dashboard", async (req,res)=>{
 let capital=0;
 try{
  const m=await kite.getMargins();
  capital=m?.equity?.net||0;
 }catch{}
 res.json({capital,BOT_ACTIVE,position,tradesToday});
});

function ema(values,p){
 const k=2/(p+1);
 let prev=values[0];
 return values.map(v=>{prev=v*k+prev*(1-k);return prev});
}

function getIST(){
 const now=new Date();
 return new Date(now.toLocaleString("en-US",{timeZone:"Asia/Kolkata"}));
}

// FIX: Using RELIANCE instead of NIFTY
async function getMarketTrend(){
 try{
  const to=new Date();
  const from=new Date(Date.now()-50*5*60*1000);
  const candles=await kite.getHistoricalData("NSE:RELIANCE","5minute",from,to);
  const prices=candles.map(c=>c.close);
  if(prices.length<20)return "SIDEWAYS";
  const change=(prices.at(-1)-prices[0])/prices[0];
  if(change>0.003)return "BULL";
  if(change<-0.003)return "BEAR";
  return "SIDEWAYS";
 }catch{
  return "SIDEWAYS";
 }
}

setInterval(()=>{
 const ist=getIST();
 if(ist.getHours()===9 && ist.getMinutes()===20){
  BOT_ACTIVE=true;
  tradesToday=0;
 }
},60000);

app.get("/",(req,res)=>res.sendFile(path.join(__dirname,"public/index.html")));
app.listen(process.env.PORT||8080,()=>console.log("7.5 FIXED RUNNING"));
