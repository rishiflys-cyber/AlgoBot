
require('dotenv').config();
const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;

// ===== ALPHA STORAGE =====
let strategies = [];
let results = [];

// ===== MOCK STRATEGY GENERATOR =====
function generateStrategy() {
  return {
    id: Date.now(),
    momentumWeight: Math.random(),
    volumeWeight: Math.random(),
    threshold: 50 + Math.random() * 30
  };
}

// ===== BACKTEST SIMULATION =====
function backtest(strategy) {
  let pnl = 0;
  let wins = 0;

  for (let i = 0; i < 50; i++) {
    let outcome = Math.random() - 0.5;
    pnl += outcome;
    if (outcome > 0) wins++;
  }

  return {
    pnl,
    winRate: wins / 50
  };
}

// ===== MAIN LOOP =====
setInterval(() => {

  const strat = generateStrategy();
  const result = backtest(strat);

  strategies.push(strat);
  results.push({ ...strat, ...result });

  // keep best 20
  results = results.sort((a,b) => b.pnl - a.pnl).slice(0, 20);

}, 3000);

// ===== ROUTES =====
app.get('/', (req, res) => {
  res.json({
    topStrategies: results
  });
});

app.get('/performance', (req, res) => {
  res.json({
    totalStrategiesTested: strategies.length,
    bestPnL: results[0]?.pnl || 0,
    time: new Date().toISOString()
  });
});

app.listen(PORT, () => console.log("Alpha Lab Running"));
