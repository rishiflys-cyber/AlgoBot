require('dotenv').config();
const express = require('express');
const app = express();

const PORT = process.env.PORT || 3000;

let botActive = true;
let capital = 0;
let pnl = 0;
let activeTrades = [];
let closedTrades = [];
let scanOutput = [];

app.get('/', (req, res) => {
  res.json({
    botActive,
    capital,
    pnl,
    activeTrades,
    closedTrades,
    scanOutput,
    serverIP: "AUTO"
  });
});

setInterval(() => {
  scanOutput = [];

  const symbols = ["RELIANCE", "TCS", "INFY"];

  symbols.forEach(symbol => {
    const price = Math.random() * 1000;
    const probability = Math.random();
    const volumeBreakout = Math.random() * 2;
    const agreementScore = Math.floor(Math.random() * 3);

    const signal = (probability > 0.6 && agreementScore >= 2) ? "BUY" : null;

    scanOutput.push({
      symbol,
      price,
      probability,
      volume: Math.floor(Math.random()*100000),
      volumeBreakout,
      indexTrend: "UP",
      agreementScore,
      signal,
      reason: "Base logic"
    });
  });

}, 3000);

app.listen(PORT, () => console.log("Server running on port " + PORT));