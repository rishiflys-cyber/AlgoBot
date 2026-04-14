require("dotenv").config();
const express = require("express");
const fs = require("fs");
const path = require("path");
const { KiteConnect } = require("kiteconnect");

const app = express();

const PORT = process.env.PORT || 8080;
const API_KEY = process.env.KITE_API_KEY;
const API_SECRET = process.env.KITE_API_SECRET;

let kite = new KiteConnect({ api_key: API_KEY });
let access_token = null;

app.get("/", (req, res) => res.send("AlgoBot Running 🚀"));

app.get("/login", (req, res) => res.redirect(kite.getLoginURL()));

app.get("/redirect", async (req, res) => {
  try {
    console.log("FULL QUERY:", req.query);

    const request_token = req.query.request_token;

    if (!request_token) {
      return res.send("No request token received ❌");
    }

    const session = await kite.generateSession(request_token, API_SECRET);

    access_token = session.access_token;
    kite.setAccessToken(access_token);

    res.send("Login Success ✅ Bot Started");
  } catch (err) {
    console.error(err);
    res.send("Login Failed ❌");
  }
});

app.listen(PORT, () => {
  console.log("AlgoBot Running on", PORT);
});
