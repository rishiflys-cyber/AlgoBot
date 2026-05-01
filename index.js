const express = require("express");
const fs = require("fs");
const KiteConnect = require("kiteconnect").KiteConnect;

const app = express();
const PORT = process.env.PORT || 3000;

const runLiveEngine = require("./engine/liveEngine");

const kc = new KiteConnect({ api_key: process.env.API_KEY });

app.get("/performance", async (req,res)=>{
    try{
        const capital = 8491.8;
        const activeTrades = await runLiveEngine(capital);
        res.json({ capital, activeTrades, mode:"LIVE" });
    }catch(e){
        res.json({error:e.message});
    }
});

app.listen(PORT, ()=>console.log("running"));
