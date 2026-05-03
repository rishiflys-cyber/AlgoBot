
const express = require("express");
const { KiteConnect } = require("kiteconnect");

const app = express();
const PORT = process.env.PORT || 3000;

const kc = new KiteConnect({ api_key: process.env.API_KEY });

/* ================= LOGIN FIX ================= */

// LOGIN ROUTE
app.get("/login",(req,res)=>{
  try{
    const url = kc.getLoginURL();
    res.redirect(url);
  }catch(e){
    res.send("Login Error: " + e.message);
  }
});

// REDIRECT ROUTE
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
    res.send("Redirect Error: " + e.message);
  }
});

/* ================= BASIC HEALTH ================= */

app.get("/",(req,res)=>{
  res.send("V101 LOGIN FIX RUNNING");
});

/* ================= PERFORMANCE ================= */

app.get("/performance",(req,res)=>{
  res.json({
    status:"LOGIN_FIXED",
    mode:"V101"
  });
});

app.listen(PORT,()=>console.log("V101 LOGIN FIX RUNNING"));
