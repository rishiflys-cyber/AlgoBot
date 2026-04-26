
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
function momentum(prev, curr) { return curr.close > prev.close ? 1 : 0; }
function volume(prev, curr) { return curr.volume > prev.volume * 1.2 ? 1 : 0; }
function volatility(prev, curr) { return (curr.high - curr.low) > (prev.high - prev.low) ? 1 : 0; }

// ===== RUN STRATEGY =====
function runStrategy(data, type) {
  let pnl = 0;
  let trades = [];

  for (let i = 1; i < data.length; i++) {
    const prev = data[i-1];
    const curr = data[i];

    let signal = 0;
    if (type === "momentum") signal = momentum(prev, curr);
    if (type === "volume") signal = volume(prev, curr);
    if (type === "volatility") signal = volatility(prev, curr);

    if (signal) {
      const tradePnl = curr.close - prev.close;
      pnl += tradePnl;
      trades.push(tradePnl);
    }
  }

  const wins = trades.filter(t => t > 0).length;

  return {
    pnl,
    winRate: trades.length ? wins / trades.length : 0,
    trades: trades.length
  };
}

// ===== CAPITAL ALLOCATION =====
function allocateCapital(results) {
  const totalScore = results.reduce((a,b)=>a + Math.max(b.pnl,0), 0) || 1;

  return results.map(r => ({
    strategy: r.name,
    weight: Math.max(r.pnl,0) / totalScore
  }));
}

// ===== RUN =====
let output = {};
try {
  const data = loadCSV('./data.csv');

  const strategies = [
    { name: "momentum", res: runStrategy(data, "momentum") },
    { name: "volume", res: runStrategy(data, "volume") },
    { name: "volatility", res: runStrategy(data, "volatility") }
  ];

  const enriched = strategies.map(s => ({
    name: s.name,
    ...s.res
  }));

  const allocation = allocateCapital(enriched);

  output = {
    strategies: enriched,
    allocation
  };

} catch (e) {
  console.log("Upload data.csv");
}

// ===== ROUTES =====
app.get('/', (req, res) => {
  res.json(output);
});

app.listen(PORT, () => console.log("Portfolio Optimizer Running"));
