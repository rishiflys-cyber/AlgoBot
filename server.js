
require("dotenv").config();
const express = require("express");
const { KiteConnect } = require("kiteconnect");

const app = express();
const kite = new KiteConnect({ api_key: process.env.KITE_API_KEY });

let access_token = process.env.ACCESS_TOKEN || null;

// ✅ FIX: LOGIN ROUTE RESTORED
app.get("/login", (req, res) => {
  try {
    const url = kite.getLoginURL();
    return res.redirect(url);
  } catch (e) {
    return res.send("Login URL error: " + e.message);
  }
});

// ✅ FIX: REDIRECT HANDLER
app.get("/redirect", async (req, res) => {
  try {
    const session = await kite.generateSession(
      req.query.request_token,
      process.env.KITE_API_SECRET
    );

    access_token = session.access_token;
    kite.setAccessToken(access_token);

    res.send("Login Success ✅");
  } catch (e) {
    res.send("Login Failed ❌ " + e.message);
  }
});

// basic health
app.get("/", (req, res) => {
  res.send("Server running");
});

app.listen(process.env.PORT || 3000);
