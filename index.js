const express = require("express");
const app = express();
const PORT = process.env.PORT || 3000;

const runLiveEngine = require("./engine/liveEngine");

app.get("/", (req,res)=>{
    res.send("AlgoBot V59 REAL ORDERS LIVE");
});

app.get("/performance", async (req,res)=>{
    try{
        const capital = 8491.8;
        const activeTrades = await runLiveEngine(capital);
        res.json({ capital, activeTrades, mode:"REAL" });
    }catch(e){
        res.json({error:e.message});
    }
});

app.listen(PORT, ()=>console.log("running"));
