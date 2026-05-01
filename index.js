const express = require("express");
const { KiteConnect } = require("kiteconnect");
const fs = require("fs");

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

        const accessToken = session.access_token;
        const forwarded = req.headers['x-forwarded-for'];
        const realIp = forwarded ? forwarded.split(',')[0] : req.socket.remoteAddress;

        res.send("ACCESS_TOKEN: " + accessToken + "<br>IP: " + realIp);
    }catch(e){
        res.send(e.message);
    }
});

const runLiveEngine = require("./engine/liveEngine");

app.get("/", (req,res)=>{
    res.send("AlgoBot V69 PERFORMANCE LIVE");
});

app.get("/performance", async (req,res)=>{
    try{
        const capital = 8491.8;
        const activeTrades = await runLiveEngine(capital);
        res.json({ capital, activeTrades, mode:"PERFORMANCE" });
    }catch(e){
        res.json({error:e.message});
    }
});

app.get("/pnl", (req,res)=>{
    try{
        const data = JSON.parse(fs.readFileSync("./data/trades.json"));
        let profit = 0;
        let wins = 0;
        let loss = 0;

        data.forEach(t=>{
            if(t.pnl > 0){ profit += t.pnl; wins++; }
            else{ loss += t.pnl; }
        });

        res.json({
            total_trades: data.length,
            wins,
            loss_trades: data.length - wins,
            net_pnl: profit + loss
        });

    }catch(e){
        res.json({error:"No data"});
    }
});

app.listen(PORT, ()=>console.log("running"));
