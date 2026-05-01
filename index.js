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
    res.send("AlgoBot V70 REAL EXECUTION TRACKING LIVE");
});

app.get("/performance", async (req,res)=>{
    try{
        const capital = 8491.8;
        const activeTrades = await runLiveEngine(capital);
        res.json({ capital, activeTrades, mode:"REAL_EXECUTION_TRACKING" });
    }catch(e){
        res.json({error:e.message});
    }
});

app.get("/pnl", (req,res)=>{
    try{
        const data = JSON.parse(fs.readFileSync("./data/trades.json"));
        let pnl = 0;
        let wins = 0;

        data.forEach(t=>{
            pnl += t.pnl || 0;
            if(t.pnl > 0) wins++;
        });

        res.json({
            total_trades: data.length,
            wins,
            loss: data.length - wins,
            net_pnl: pnl
        });

    }catch(e){
        res.json({error:"No trades yet"});
    }
});

app.listen(PORT, ()=>console.log("running"));
