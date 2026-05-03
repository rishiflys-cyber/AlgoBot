
const express = require("express");
const { KiteConnect } = require("kiteconnect");

const app = express();
const PORT = process.env.PORT || 3000;

const kc = new KiteConnect({ api_key: process.env.API_KEY });

// ✅ FIXED LOGIN ROUTE
app.get("/login", (req, res) => {
  try {
    const url = kc.getLoginURL();
    res.redirect(url);
  } catch (e) {
    res.send("Login error: " + e.message);
  }
});

// redirect after login
app.get("/redirect", async (req, res) => {
  try {
    const session = await kc.generateSession(
      req.query.request_token,
      process.env.API_SECRET
    );
    res.send("ACCESS_TOKEN: " + session.access_token);
  } catch (e) {
    res.send("Redirect error: " + e.message);
  }
});

// health check
app.get("/", (req,res)=>{
  res.send("AlgoBot running");
});

app.listen(PORT, () => console.log("LOGIN FIX RUNNING"));
