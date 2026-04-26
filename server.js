
require('dotenv').config();
const express = require('express');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// ===== STATE =====
let strategies = [
  { name: "momentum", pnl: 0, active: true },
  { name: "volume", pnl: 0, active: true },
  { name: "volatility", pnl: 0, active: true }
];

let capitalAllocation = {};

// ===== SIMULATE PERFORMANCE UPDATE =====
function updatePerformance() {
  strategies = strategies.map(s => {
    const change = (Math.random() - 0.5) * 100;
    return { ...s, pnl: s.pnl + change };
  });
}

// ===== ROTATION LOGIC =====
function rotateStrategies() {
  // deactivate worst performer
  const sorted = [...strategies].sort((a,b)=>b.pnl-a.pnl);

  strategies = strategies.map(s => ({
    ...s,
    active: sorted.indexOf(s) < 2 // keep top 2 active
  }));
}

// ===== CAPITAL REALLOCATION =====
function rebalanceCapital() {
  const active = strategies.filter(s => s.active);
  const total = active.reduce((a,b)=>a + Math.max(b.pnl,0), 0) || 1;

  capitalAllocation = {};

  active.forEach(s => {
    capitalAllocation[s.name] = Math.max(s.pnl,0) / total;
  });
}

// ===== MAIN LOOP =====
setInterval(() => {
  updatePerformance();
  rotateStrategies();
  rebalanceCapital();
}, 3000);

// ===== ROUTES =====
app.get('/', (req, res) => {
  res.json({
    strategies,
    capitalAllocation
  });
});

app.get('/performance', (req, res) => {
  res.json({
    activeStrategies: strategies.filter(s=>s.active).map(s=>s.name),
    allocation: capitalAllocation,
    time: new Date().toISOString()
  });
});

app.listen(PORT, () => console.log("Rebalancer Running"));
