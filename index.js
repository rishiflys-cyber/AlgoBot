require("dotenv").config();
const express = require("express");
const fs = require("fs");
const { KiteConnect } = require("kiteconnect");

const runLiveEngine = require("./engine/liveEngine");

const app = express();
const PORT = process.env.PORT || 3000;

const kc = new KiteConnect({
  api_key: process.env.API_KEY,
});

let access_token = null;
let capital = 0;
let activeTrades = [];

// HOME
app.get("/", (req, res) => {
  res.send(`<h2>AlgoBot LIVE</h2><a href="/login">👉 LOGIN</a>`);
});

// LOGIN
app.get("/login", (req, res) => {
  const url = kc.getLoginURL();
  res.redirect(url);
});

// REDIRECT
app.get("/redirect", async (req, res) => {
  try {
    const request_token = req.query.request_token;

    const session = await kc.generateSession(
      request_token,
      process.env.API_SECRET
    );

    access_token = session.access_token;
    kc.setAccessToken(access_token);

    fs.writeFileSync("access_token.txt", access_token);

    res.send("✅ Login success. Go to /performance");
  } catch (err) {
    res.send("❌ Login failed: " + err.message);
  }
});

// PERFORMANCE
app.get("/performance", async (req, res) => {
  try {
    if (!access_token) {
      if (fs.existsSync("access_token.txt")) {
        access_token = fs.readFileSync("access_token.txt", "utf-8");
        kc.setAccessToken(access_token);
      } else {
        return res.json({ capital: 0, error: "Login required" });
      }
    }

    const margins = await kc.getMargins();
    capital = margins.equity.available.live_balance;

    // SIMPLE SIGNALS (stable)
    const symbols = require("./nse200.json");

    const rankedSignals = symbols.map((s) => ({
      symbol: s,
      price: Math.random() * 1000 + 100,
      score: Math.random(),
    }));

    if (process.env.LIVE_TRADING === "true") {
      activeTrades = await runLiveEngine(rankedSignals, capital, kc);
    }

    res.json({
      capital,
      activeTrades,
      mode: process.env.LIVE_TRADING === "true" ? "LIVE" : "PAPER",
    });
  } catch (err) {
    res.json({ error: err.message });
  }
});

app.listen(PORT, () => console.log("🚀 Server running"));