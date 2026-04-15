
require("dotenv").config();
const express = require("express");
const path = require("path");

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

let capital = 5000;
let trades = [];
let wins = 0;
let losses = 0;
let BOT_ACTIVE = true;

// UI
app.get("/", (req,res)=>res.sendFile(path.join(__dirname,"public/index.html")));

// Dashboard
app.get("/dashboard",(req,res)=>{
    const winRate = trades.length ? ((wins/trades.length)*100).toFixed(1) : 0;
    res.json({capital,trades,winRate});
});

// Start / Kill
app.get("/start",(req,res)=>{BOT_ACTIVE=true; res.send("BOT STARTED");});
app.get("/kill",(req,res)=>{BOT_ACTIVE=false; res.send("BOT STOPPED");});

// Aggressive Trade Simulator
setInterval(()=>{
    if(!BOT_ACTIVE) return;

    let tradeAmount = capital * 0.2;
    let win = Math.random() > 0.4; // aggressive

    if(win){
        let profit = tradeAmount * 0.05;
        capital += profit;
        wins++;
        trades.push({result:"WIN",amount:profit});
    } else {
        let loss = tradeAmount * 0.05;
        capital -= loss;
        losses++;
        trades.push({result:"LOSS",amount:loss});
    }

},5000);

const PORT = process.env.PORT || 8080;
app.listen(PORT,()=>console.log("Aggressive Bot Running"));
