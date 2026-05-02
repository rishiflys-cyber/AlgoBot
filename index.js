const express = require("express");
const path = require("path");
const { KiteConnect } = require("kiteconnect");

const app = express();
const PORT = process.env.PORT || 3000;

const kc = new KiteConnect({ api_key: process.env.API_KEY });
kc.setAccessToken(process.env.ACCESS_TOKEN);

// serve dashboard
app.use(express.static(path.join(__dirname, "public")));

app.get("/api/metrics", async (req,res)=>{
    try{
        const positions = await kc.getPositions();
        let pnl = 0;
        positions.net.forEach(p=> pnl += p.pnl);

        res.json({
            pnl,
            positions: positions.net,
            timestamp: new Date().toISOString()
        });
    }catch(e){
        res.json({error:e.message});
    }
});

app.get("/", (req,res)=>{
    res.sendFile(path.join(__dirname,"public","index.html"));
});

app.listen(PORT, ()=>console.log("running V77 dashboard"));
