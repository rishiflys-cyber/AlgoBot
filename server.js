
require('dotenv').config();
const express = require('express');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// ===== LOAD DATA =====
function loadCSV(path) {
  const data = fs.readFileSync(path, 'utf-8').split('\n').slice(1);
  return data.map(row => {
    const [date, open, high, low, close, volume] = row.split(',');
    return {
      date,
      open: +open,
      high: +high,
      low: +low,
      close: +close,
      volume: +volume
    };
  }).filter(d => !isNaN(d.close));
}

// ===== STRATEGIES =====

// 1. Momentum
function momentumStrategy(prev, curr) {
  return curr.close > prev.close ? 1 : 0;
}

// 2. Moving Average
function maStrategy(data, i) {
  if (i < 5) return 0;
  const ma = (data[i-1].close + data[i-2].close + data[i-3].close + data[i-4].close + data[i-5].close) / 5;
  return data[i].close > ma ? 1 : 0;
}

// 3. Volume Breakout
function volumeStrategy(prev, curr) {
  return curr.volume > prev.volume * 1.2 ? 1 : 0;
}

// 4. Volatility Expansion
function volatilityStrategy(prev, curr) {
  return (curr.high - curr.low) > (prev.high - prev.low) ? 1 : 0;
}

// ===== ENSEMBLE =====
function ensembleStrategy(data) {
  let pnl = 0;
  let trades = [];

  for (let i = 6; i < data.length; i++) {
    const prev = data[i-1];
    const curr = data[i];

    const signals = [
      momentumStrategy(prev, curr),
      maStrategy(data, i),
      volumeStrategy(prev, curr),
      volatilityStrategy(prev, curr)
    ];

    const score = signals.reduce((a,b)=>a+b,0);

    // require 3/4 agreement
    if (score >= 3) {
      const entry = curr.close;
      const target = entry * 1.01;
      const stop = entry * 0.995;

      let exit = entry;

      for (let j = i+1; j < data.length; j++) {
        if (data[j].high >= target) { exit = target; break; }
        if (data[j].low <= stop) { exit = stop; break; }
      }

      const tradePnl = exit - entry;
      pnl += tradePnl;

      trades.push({
        date: curr.date,
        score,
        entry,
        exit,
        pnl: tradePnl
      });
    }
  }

  return { pnl, trades };
}

// ===== RUN =====
let results = {};
try {
  const data = loadCSV('./data.csv');
  results = ensembleStrategy(data);
} catch (e) {
  console.log("Upload data.csv");
}

// ===== METRICS =====
function metrics(trades) {
  if (!trades || trades.length === 0) return {};

  const wins = trades.filter(t => t.pnl > 0).length;

  return {
    totalTrades: trades.length,
    winRate: wins / trades.length,
    avgPnL: trades.reduce((a,b)=>a+b.pnl,0)/trades.length
  };
}

// ===== ROUTES =====
app.get('/', (req, res) => {
  res.json({
    totalPnL: results.pnl || 0,
    ...metrics(results.trades)
  });
});

app.get('/trades', (req, res) => {
  res.json(results.trades || []);
});

app.listen(PORT, () => console.log("Ensemble Engine Running"));
