const express = require("express");
const { KiteConnect } = require("kiteconnect");

const app = express();
const PORT = process.env.PORT || 3000;

const kc = new KiteConnect({ api_key: process.env.API_KEY });

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

const runEngine = require("./engine/liveEngine");

app.get("/", (req,res)=>{
    res.send("AlgoBot V75 RISK MANAGER LIVE");
});

app.get("/performance", async (req,res)=>{
    try{
        const capital = 8491.8;
        const result = await runEngine(capital);
        res.json({ capital, result, mode:"RISK_MANAGER" });
    }catch(e){
        res.json({error:e.message});
    }
});

app.listen(PORT, ()=>console.log("running"));
