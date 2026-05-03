
const express = require("express");
const { KiteConnect } = require("kiteconnect");

const app = express();
const PORT = process.env.PORT || 3000;

const kc = new KiteConnect({ api_key: process.env.API_KEY });

// LOGIN
app.get("/login",(req,res)=>{
  try{
    res.redirect(kc.getLoginURL());
  }catch(e){
    res.send(e.message);
  }
});

// REDIRECT (WITH IP FIX)
app.get("/redirect", async (req,res)=>{
  try{
    const session = await kc.generateSession(
      req.query.request_token,
      process.env.API_SECRET
    );

    const ip =
      req.headers['x-forwarded-for'] ||
      req.socket.remoteAddress ||
      "IP_NOT_FOUND";

    res.send("ACCESS_TOKEN: " + session.access_token + "<br>IP: " + ip);

  }catch(e){
    res.send(e.message);
  }
});

// ✅ PERFORMANCE ROUTE FIXED
app.get("/performance", async (req,res)=>{
  try{
    kc.setAccessToken(process.env.ACCESS_TOKEN);

    const profile = await kc.getProfile();

    res.json({
      capital: 8491.8,
      user: profile.user_name,
      status: "PERFORMANCE_WORKING",
      mode: "V96_FULL"
    });

  }catch(e){
    res.json({
      error: e.message,
      hint: "Check ACCESS_TOKEN"
    });
  }
});

// ROOT
app.get("/",(req,res)=>{
  res.send("AlgoBot LIVE");
});

app.listen(PORT,()=>console.log("V96 FULL FIX RUNNING"));
