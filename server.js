require('dotenv').config();
const express = require('express');
const KiteConnect = require("kiteconnect").KiteConnect;

const app = express();
const PORT = process.env.PORT || 3000;

let kite = new KiteConnect({ api_key: process.env.KITE_API_KEY });
let accessToken = process.env.ACCESS_TOKEN || null;

if (accessToken) kite.setAccessToken(accessToken);

// STATE
let capital = 0;

// LOGIN
app.get('/login', (req, res) => res.redirect(kite.getLoginURL()));

app.get('/redirect', async (req, res) => {
  try {
    const session = await kite.generateSession(req.query.request_token, process.env.KITE_API_SECRET);
    accessToken = session.access_token;
    kite.setAccessToken(accessToken);
    console.log("TOKEN SET");
    res.send("Login success");
  } catch (e) {
    console.error(e.message);
    res.send("Login failed");
  }
});

// CAPITAL EXTRACTION FUNCTION (ROBUST)
function extractCapital(margins) {
  console.log("FULL MARGINS:", JSON.stringify(margins, null, 2));

  if (!margins) return 0;

  // Try multiple paths safely
  return (
    margins?.equity?.available?.cash ||
    margins?.equity?.available?.live_balance ||
    margins?.equity?.net ||
    margins?.commodity?.available?.cash ||
    margins?.commodity?.net ||
    0
  );
}

// DASHBOARD
app.get('/', async (req, res) => {
  if (accessToken) {
    try {
      const margins = await kite.getMargins();
      capital = extractCapital(margins);
    } catch (e) {
      console.error("MARGIN ERROR:", e.message);
    }
  }

  res.json({
    capital,
    access: accessToken ? "ACTIVE" : "NO"
  });
});

// PERFORMANCE
app.get('/performance', (req, res) => {
  res.json({
    status: "working",
    capital,
    time: new Date().toISOString()
  });
});

app.listen(PORT, () => console.log("Running " + PORT));