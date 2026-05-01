const express = require("express");
const { KiteConnect } = require("kiteconnect");

const app = express();
const PORT = process.env.PORT || 3000;

const apiKey = process.env.API_KEY;
const apiSecret = process.env.API_SECRET;

const kc = new KiteConnect({ api_key: apiKey });

// LOGIN
app.get("/login", (req,res)=>{
    res.redirect(kc.getLoginURL());
});

// REDIRECT (SHOW TOKEN)
app.get("/redirect", async (req,res)=>{
    try{
        const requestToken = req.query.request_token;
        const response = await kc.generateSession(requestToken, apiSecret);
        const accessToken = response.access_token;

        res.send("ACCESS_TOKEN: " + accessToken);
    }catch(e){
        res.send(e.message);
    }
});

const runLiveEngine = require("./engine/liveEngine");

app.get("/", (req,res)=>{
    res.send("AlgoBot TOKEN FIX LIVE");
});

app.get("/performance", async (req,res)=>{
    try{
        const capital = 8491.8;
        const activeTrades = await runLiveEngine(capital);
        res.json({ capital, activeTrades, mode:"REAL_SAFE" });
    }catch(e){
        res.json({error:e.message});
    }
});

app.listen(PORT, ()=>console.log("running"));
