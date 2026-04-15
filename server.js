require("dotenv").config();
const express = require("express");
const path = require("path");
const { KiteConnect } = require("kiteconnect");

const app = express();
app.use(express.json());

app.use(express.static(path.join(__dirname, "public")));
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public/index.html"));
});

const kite = new KiteConnect({ api_key: process.env.KITE_API_KEY });

let BOT_ACTIVE = true;

app.get("/login", (req, res) => res.redirect(kite.getLoginURL()));

app.get("/redirect", async (req, res) => {
  try {
    const session = await kite.generateSession(req.query.request_token, process.env.KITE_API_SECRET);
    kite.setAccessToken(session.access_token);
    res.send("Login Success ✅");
  } catch {
    res.send("Login Failed ❌");
  }
});

app.get("/start", (req, res) => {
  BOT_ACTIVE = true;
  res.send("🚀 BOT STARTED");
});

app.get("/kill", (req, res) => {
  BOT_ACTIVE = false;
  res.send("🛑 BOT STOPPED");
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log("Server running"));
