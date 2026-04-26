
require('dotenv').config();
const express = require('express');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// ===== LOAD HISTORICAL DATA (CSV expected) =====
function loadCSV(path) {
  const data = fs.readFileSync(path, 'utf-8').split('\n').slice(1);
  return data.map(row => {
    const [date, open, high, low, close, volume] = row.split(',');
    return {
      date,
      open: parseFloat(open),
      high: parseFloat(high),
      low: parseFloat(low),
      close: parseFloat(close),
      volume: parseFloat(volume)
    };
  }).filter(d => !isNaN(d.close));
}

// ===== STRATEGY =====
function strategy(data) {
  let trades = [];
  let pnl = 0;

  for (let i = 1; i < data.length; i++) {
    const prev = data[i - 1];
    const curr = data[i];

    const momentum = curr.close > prev.close;
    const breakout = curr.volume > prev.volume;

    if (momentum && breakout) {
      const tradePnl = curr.close - prev.close;
      pnl += tradePnl;
      trades.push({ pnl: tradePnl, date: curr.date });
    }
  }

  return { pnl, trades };
}

// ===== BACKTEST RUN =====
let results = {};

try {
  const data = loadCSV('./data.csv');
  results = strategy(data);
} catch (e) {
  console.log("No data.csv found. Upload historical data.");
}

// ===== ROUTES =====
app.get('/', (req, res) => {
  res.json({
    totalPnL: results.pnl || 0,
    trades: results.trades ? results.trades.length : 0
  });
});

app.get('/trades', (req, res) => {
  res.json(results.trades || []);
});

app.listen(PORT, () => console.log("Real Backtest Engine Running"));
