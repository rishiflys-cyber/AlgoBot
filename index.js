const express = require("express");
const { KiteConnect } = require("kiteconnect");
const fs = require("fs");

const app = express();
const PORT = process.env.PORT || 3000;

const apiKey = process.env.API_KEY;
const apiSecret = process.env.API_SECRET;

const kc = new KiteConnect({ api_key: apiKey });

// LOGIN ROUTE
app.get("/login", (req, res) => {
    const loginUrl = kc.getLoginURL();
    res.redirect(loginUrl);
});

// REDIRECT ROUTE
app.get("/redirect", async (req, res) => {
    try {
        const requestToken = req.query.request_token;

        const response = await kc.generateSession(requestToken, apiSecret);
        const accessToken = response.access_token;

        fs.writeFileSync("access_token.txt", accessToken);

        res.send("Login success. Go to /performance");
    } catch (e) {
        res.send("Login failed: " + e.message);
    }
});

const runLiveEngine = require("./engine/liveEngine");

app.get("/", (req,res)=>{
    res.send("AlgoBot LOGIN FIX LIVE");
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
