const express = require("express");
const { KiteConnect } = require("kiteconnect");
const fs = require("fs");

const app = express();
const PORT = process.env.PORT || 3000;

const kc = new KiteConnect({ api_key: process.env.API_KEY });

// LOGIN + IP
app.get("/login", (req,res)=>{
    res.redirect(kc.getLoginURL());
});

app.get("/redirect", async (req,res)=>{
    try{
        const requestToken = req.query.request_token;
        const session = await kc.generateSession(requestToken, process.env.API_SECRET);

        const forwarded = req.headers['x-forwarded-for'];
        const realIp = forwarded ? forwarded.split(',')[0] : req.socket.remoteAddress;

        res.send("ACCESS_TOKEN: " + session.access_token + "<br>IP: " + realIp);

    }catch(e){
        res.send(e.message);
    }
});

const runLiveEngine = require("./engine/liveEngine");

app.get("/", (req,res)=>{
    res.send("AlgoBot V71 TRADE MONITOR LIVE");
});

app.get("/performance", async (req,res)=>{
    try{
        const capital = 8491.8;
        const activeTrades = await runLiveEngine(capital);
        res.json({ capital, activeTrades, mode:"TRADE_MONITOR" });
    }catch(e){
        res.json({error:e.message});
    }
});

app.get("/positions", async (req,res)=>{
    try{
        const positions = await kc.getPositions();
        res.json(positions);
    }catch(e){
        res.json({error:e.message});
    }
});

app.listen(PORT, ()=>console.log("running"));
