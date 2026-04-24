
require("dotenv").config();
const express=require("express");
const {KiteConnect}=require("kiteconnect");

const app=express();
const kite=new KiteConnect({api_key:process.env.KITE_API_KEY});

let BOT_ACTIVE=false;
let MANUAL_KILL=false;

app.get("/",(req,res)=>{
 res.send("BOT RUNNING - USE /performance");
});

app.get("/performance",(req,res)=>{
 res.json({
  botActive: BOT_ACTIVE && !MANUAL_KILL,
  message:"system alive"
 });
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

app.listen(process.env.PORT||3000,()=>console.log("SERVER STARTED"));
