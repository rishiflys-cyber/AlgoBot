
const express = require("express");
const { KiteConnect } = require("kiteconnect");

const app = express();
const PORT = process.env.PORT || 3000;

const kc = new KiteConnect({ api_key: process.env.API_KEY });

app.use(express.static("public"));

/* LOGIN */
app.get("/login",(req,res)=>res.redirect(kc.getLoginURL()));

app.get("/redirect", async (req,res)=>{
  const session = await kc.generateSession(req.query.request_token, process.env.API_SECRET);
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || "IP_NOT_FOUND";
  res.send("ACCESS_TOKEN: " + session.access_token + "<br>IP: " + ip);
});

/* DATA */
let capital = 8491.8;
let trades = [];
let closedTrades = [];

/* PERFORMANCE FIX */
app.get("/performance",(req,res)=>{
  res.json({
    capital,
    trades,
    closedTrades,
    mode:"V108_FIXED"
  });
});

/* DASHBOARD API */
app.get("/api/data",(req,res)=>{
  res.json({
    capital,
    trades: closedTrades
  });
});

app.get("/",(req,res)=>{
  res.send("V108 FIXED RUNNING");
});

app.listen(PORT,()=>console.log("RUNNING"));
