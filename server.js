
require('dotenv').config();
const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;

// ===== STATE =====
let tradeHistory = [];
let equityCurve = [];
let capital = 100000;

// ===== SIMULATED UPDATE LOOP =====
setInterval(() => {
  const pnl = (Math.random() - 0.5) * 200;
  capital += pnl;

  tradeHistory.push({
    pnl,
    time: new Date().toISOString()
  });

  equityCurve.push(capital);

}, 2000);

// ===== METRICS =====
function getMetrics() {
  const trades = tradeHistory.length;
  const wins = tradeHistory.filter(t => t.pnl > 0).length;
  const losses = trades - wins;

  const winRate = trades ? wins / trades : 0;

  const avgPnL = trades
    ? tradeHistory.reduce((a,b)=>a+b.pnl,0)/trades
    : 0;

  return {
    trades,
    wins,
    losses,
    winRate,
    avgPnL,
    capital
  };
}

// ===== ROUTES =====
app.get('/', (req, res) => {
  res.json({
    metrics: getMetrics(),
    equityCurve,
    tradeHistory
  });
});

app.get('/performance', (req, res) => {
  res.json({
    status: "live",
    ...getMetrics(),
    time: new Date().toISOString()
  });
});

app.listen(PORT, () => console.log("Dashboard Running"));
