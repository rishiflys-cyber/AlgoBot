
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

// ===== IMPROVED STRATEGY =====
function refinedStrategy(data) {
  let pnl = 0;
  let trades = [];

  for (let i = 5; i < data.length; i++) {
    const prev = data[i - 1];
    const curr = data[i];

    // moving average trend
    const ma = (data[i-1].close + data[i-2].close + data[i-3].close + data[i-4].close + data[i-5].close) / 5;

    const trendUp = curr.close > ma;
    const momentum = curr.close > prev.close;
    const volumeSpike = curr.volume > prev.volume * 1.2;

    // refined entry condition
    if (trendUp && momentum && volumeSpike) {
      const entry = curr.close;
      const target = entry * 1.01;
      const stop = entry * 0.995;

      let exitPrice = entry;

      for (let j = i+1; j < data.length; j++) {
        if (data[j].high >= target) {
          exitPrice = target;
          break;
        }
        if (data[j].low <= stop) {
          exitPrice = stop;
          break;
        }
      }

      const tradePnl = exitPrice - entry;
      pnl += tradePnl;

      trades.push({
        entry,
        exit: exitPrice,
        pnl: tradePnl,
        date: curr.date
      });
    }
  }

  return { pnl, trades };
}

// ===== RUN =====
let results = {};
try {
  const data = loadCSV('./data.csv');
  results = refinedStrategy(data);
} catch (e) {
  console.log("Upload data.csv");
}

// ===== METRICS =====
function metrics(trades) {
  if (!trades || trades.length === 0) return {};

  const wins = trades.filter(t => t.pnl > 0).length;
  const losses = trades.length - wins;

  return {
    totalTrades: trades.length,
    winRate: wins / trades.length,
    avgPnL: trades.reduce((a,b)=>a+b.pnl,0)/trades.length,
    wins,
    losses
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

app.listen(PORT, () => console.log("Strategy Refinement Running"));
