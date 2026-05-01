const express = require("express");
const { KiteConnect } = require("kiteconnect");

const app = express();
const PORT = process.env.PORT || 3000;

const kc = new KiteConnect({ api_key: process.env.API_KEY });

// LOGIN ROUTE
app.get("/login", (req,res)=>{
    res.redirect(kc.getLoginURL());
});

// REDIRECT ROUTE
app.get("/redirect", async (req,res)=>{
    try{
        const requestToken = req.query.request_token;
        const session = await kc.generateSession(requestToken, process.env.API_SECRET);
        const accessToken = session.access_token;
        res.send("ACCESS_TOKEN: " + accessToken);
    }catch(e){
        res.send(e.message);
    }
});

const runLiveEngine = require("./engine/liveEngine");

app.get("/", (req,res)=>{
    res.send("AlgoBot V61 PRO MODE LIVE");
});

app.get("/performance", async (req,res)=>{
    try{
        const capital = 8491.8;
        const activeTrades = await runLiveEngine(capital);
        res.json({ capital, activeTrades, mode:"PRO" });
    }catch(e){
        res.json({error:e.message});
    }
});

app.listen(PORT, ()=>console.log("running"));
