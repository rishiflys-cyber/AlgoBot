
require('dotenv').config();
const express = require('express');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

const RESULTS_FILE = "./research_results.json";

// ===== LOAD/SAVE =====
function loadResults() {
  try {
    return JSON.parse(fs.readFileSync(RESULTS_FILE));
  } catch {
    return [];
  }
}

function saveResults(data) {
  fs.writeFileSync(RESULTS_FILE, JSON.stringify(data, null, 2));
}

let results = loadResults();

// ===== STRATEGY VARIATIONS =====
function generateStrategyVariant() {
  return {
    id: Date.now(),
    momentumThreshold: 0.5 + Math.random() * 0.3,
    breakoutThreshold: 1 + Math.random()
  };
}

// ===== BACKTEST =====
function runBacktest(strategy) {
  let pnl = 0;
  let wins = 0;

  let price = 1000;

  for (let i = 0; i < 100; i++) {
    const change = (Math.random() - 0.5) * 20;
    price += change;

    const momentum = Math.random();
    const breakout = 1 + Math.random();

    if (momentum > strategy.momentumThreshold && breakout > strategy.breakoutThreshold) {
      pnl += change;
      if (change > 0) wins++;
    }
  }

  return {
    pnl,
    winRate: wins / 100
  };
}

// ===== MAIN LOOP =====
setInterval(() => {

  const strat = generateStrategyVariant();
  const result = runBacktest(strat);

  results.push({
    ...strat,
    ...result,
    timestamp: new Date().toISOString()
  });

  // keep top 50 by pnl
  results = results.sort((a,b)=>b.pnl-a.pnl).slice(0,50);

  saveResults(results);

}, 3000);

// ===== ROUTES =====
app.get('/', (req, res) => {
  res.json({
    topStrategies: results.slice(0,10)
  });
});

app.get('/report', (req, res) => {
  res.json({
    totalTested: results.length,
    best: results[0] || null
  });
});

app.listen(PORT, () => console.log("Research Workflow Running"));
