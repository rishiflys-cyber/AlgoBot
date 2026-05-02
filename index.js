const express = require("express");
const { KiteConnect } = require("kiteconnect");

const app = express();
const PORT = process.env.PORT || 3000;

const kc = new KiteConnect({ api_key: process.env.API_KEY });

// ✅ LOGIN FIX
app.get("/login", (req, res) => {
    res.redirect(kc.getLoginURL());
});

app.get("/redirect", async (req, res) => {
    try {
        const session = await kc.generateSession(
            req.query.request_token,
            process.env.API_SECRET
        );

        const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

        res.send("ACCESS_TOKEN: " + session.access_token + "<br>IP: " + ip);

    } catch (e) {
        res.send(e.message);
    }
});

// PERFORMANCE
app.get("/performance", (req, res) => {
    res.json({
        capital: 8491.8,
        status: "READY",
        mode: "FULL_AUTO"
    });
});

app.get("/", (req,res)=>{
    res.send("AlgoBot Running");
});

app.listen(PORT, () => console.log("LOGIN FIX RUNNING"));
