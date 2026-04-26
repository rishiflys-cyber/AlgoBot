
require('dotenv').config();
const express = require('express');
const fs = require('fs');
const axios = require('axios');
const KiteConnect = require("kiteconnect").KiteConnect;

const app = express();
const PORT = process.env.PORT || 3000;

const TOKEN_FILE = "access_token.json";

let kite = new KiteConnect({ api_key: process.env.KITE_API_KEY });
let accessToken = null;

// ===== LOAD TOKEN IF EXISTS =====
if (fs.existsSync(TOKEN_FILE)) {
  const saved = JSON.parse(fs.readFileSync(TOKEN_FILE));
  accessToken = saved.token;
  kite.setAccessToken(accessToken);
  console.log("Loaded saved access token");
}

// ===== STATE =====
let state = {
  capital: 0,
  pnl: 0,
  serverIP: null,
  mode: "PAPER"
};

// ===== LOGIN =====
app.get('/login', (req, res) => {
  res.redirect(kite.getLoginURL());
});

app.get('/redirect', async (req, res) => {
  try {
    const session = await kite.generateSession(req.query.request_token, process.env.KITE_API_SECRET);

    accessToken = session.access_token;
    kite.setAccessToken(accessToken);

    // SAVE TOKEN
    fs.writeFileSync(TOKEN_FILE, JSON.stringify({ token: accessToken }));

    const ip = await axios.get("https://api.ipify.org?format=json");
    state.serverIP = ip.data.ip;

    res.send("Login saved permanently | IP: " + state.serverIP);
  } catch (e) {
    res.send("Login failed: " + e.message);
  }
});

// ===== AUTO VALIDATION =====
async function validateSession() {
  if (!accessToken) return false;

  try {
    await kite.getProfile();
    return true;
  } catch {
    console.log("Session expired, login required");
    accessToken = null;
    return false;
  }
}

// ===== CAPITAL =====
async function updateCapital() {
  try {
    const m = await kite.getMargins();
    state.capital = m?.equity?.available?.cash || m?.equity?.net || state.capital;
  } catch {}
}

// ===== LOOP =====
setInterval(async () => {
  const valid = await validateSession();
  if (!valid) return;

  await updateCapital();

}, 5000);

// ===== ROUTES =====
app.get('/', (req, res) => res.json(state));

app.get('/performance', (req, res) => {
  res.json({
    capital: state.capital,
    sessionActive: !!accessToken,
    time: new Date().toISOString()
  });
});

app.listen(PORT, () => console.log("PERSISTENT LOGIN SYSTEM RUNNING"));
