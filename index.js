const express = require("express");
const path = require("path");
const { KiteConnect } = require("kiteconnect");

const app = express();
const PORT = process.env.PORT || 3000;

const kc = new KiteConnect({ api_key: process.env.API_KEY });

// LOGIN FIX
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

kc.setAccessToken(process.env.ACCESS_TOKEN);

// dashboard
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

app.listen(PORT, ()=>console.log("running V77 FIX"));
