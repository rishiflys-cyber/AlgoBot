require("dotenv").config();
const express = require("express");
const path = require("path");
const { KiteConnect } = require("kiteconnect");

const app = express();
app.use(express.static(path.join(__dirname, "public")));

const kite = new KiteConnect({ api_key: process.env.KITE_API_KEY });

let access_token = null;
let BOT_ACTIVE = false;

console.log("🚀 CLEAN 7.5 BOT RUNNING");

app.get("/login", (req, res) => {
  res.redirect(kite.getLoginURL());
});

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
    res.send("Login Failed ❌");
  }
});

app.get("/start", (req, res) => {
  BOT_ACTIVE = true;
  res.send("BOT STARTED");
});

app.get("/kill", (req, res) => {
  BOT_ACTIVE = false;
  res.send("BOT STOPPED");
});

app.get("/dashboard", (req, res) => {
  res.json({
    BOT_ACTIVE,
    message: "7.5 CLEAN SYSTEM RUNNING"
  });
});

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public/index.html"));
});

app.listen(process.env.PORT || 8080, () => {
  console.log("SERVER LIVE");
});
