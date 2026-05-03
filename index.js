
const express = require("express");
const path = require("path");
const { KiteConnect } = require("kiteconnect");

const app = express();
const PORT = process.env.PORT || 3000;

const kc = new KiteConnect({ api_key: process.env.API_KEY });

// LOGIN
app.get("/login",(req,res)=>res.redirect(kc.getLoginURL()));

app.get("/redirect", async (req,res)=>{
  const session = await kc.generateSession(req.query.request_token, process.env.API_SECRET);
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  res.send("ACCESS_TOKEN: "+session.access_token+"<br>IP: "+ip);
});

// PERFORMANCE
app.get("/performance", async (req,res)=>{
  kc.setAccessToken(process.env.ACCESS_TOKEN);
  const engine = require("./engine/liveEngine");
  const result = await engine.run(kc, 8491.8);
  res.json({capital:8491.8,...result});
});

app.use(express.static(path.join(__dirname,"public")));
app.listen(PORT,()=>console.log("V91 INSTITUTION MODE RUNNING"));
