const express = require("express");
const path = require("path");
const { KiteConnect } = require("kiteconnect");

const app = express();
const PORT = process.env.PORT || 3000;

const kc = new KiteConnect({ api_key: process.env.API_KEY });
kc.setAccessToken(process.env.ACCESS_TOKEN);

// LOGIN
app.get("/login",(req,res)=>res.redirect(kc.getLoginURL()));

app.get("/redirect", async (req,res)=>{
  const session = await kc.generateSession(req.query.request_token, process.env.API_SECRET);
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  res.send("ACCESS_TOKEN: "+session.access_token+"<br>IP: "+ip);
});

// DASHBOARD
app.use(express.static(path.join(__dirname,"public")));

app.get("/performance", async (req,res)=>{
  const engine = require("./engine/liveEngine");
  const result = await engine.run(kc, 8491.8);
  res.json(result);
});

app.get("/", (req,res)=>res.sendFile(path.join(__dirname,"public","index.html")));

app.listen(PORT,()=>console.log("V79 RUNNING"));
