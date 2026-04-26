
require('dotenv').config();
const express = require('express');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

const JOURNAL_FILE = "./journal.json";

// ===== LOAD JOURNAL =====
function loadJournal() {
  try {
    return JSON.parse(fs.readFileSync(JOURNAL_FILE));
  } catch {
    return [];
  }
}

function saveJournal(data) {
  fs.writeFileSync(JOURNAL_FILE, JSON.stringify(data, null, 2));
}

let journal = loadJournal();

// ===== BACKTEST ENGINE (simple deterministic) =====
function backtest(prices) {
  let trades = [];
  let pnl = 0;

  for (let i = 1; i < prices.length; i++) {
    const change = prices[i] - prices[i - 1];

    // simple momentum logic
    if (change > 0) {
      pnl += change;
      trades.push({ result: change });
    } else {
      pnl += change;
      trades.push({ result: change });
    }
  }

  return { pnl, trades };
}

// ===== REFINEMENT LOGIC =====
function analyzeJournal() {
  if (journal.length === 0) return { winRate: 0, avgPnL: 0 };

  const wins = journal.filter(t => t.pnl > 0).length;
  const winRate = wins / journal.length;

  const avgPnL = journal.reduce((a,b)=>a+b.pnl,0)/journal.length;

  return { winRate, avgPnL };
}

// ===== SIMULATION LOOP =====
setInterval(() => {
  // simulate price data
  let prices = [];
  let p = 1000;

  for (let i = 0; i < 50; i++) {
    p += (Math.random() - 0.5) * 10;
    prices.push(p);
  }

  const result = backtest(prices);

  // log trades
  result.trades.forEach(t => {
    journal.push({ pnl: t.result, time: new Date().toISOString() });
  });

  // keep last 500
  journal = journal.slice(-500);

  saveJournal(journal);

}, 3000);

// ===== ROUTES =====
app.get('/', (req, res) => {
  const analysis = analyzeJournal();

  res.json({
    tradesLogged: journal.length,
    ...analysis
  });
});

app.get('/journal', (req, res) => {
  res.json(journal);
});

app.listen(PORT, () => console.log("Edge Refinement Engine Running"));
