
require('dotenv').config();
const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;

// ===== CONFIG =====
let capital = 1000000; // example
let pnl = 0;
let maxDrawdown = -0.05 * capital;
let alertTriggered = false;
let killSwitch = false;

// ===== ALERT FUNCTION =====
function triggerAlert(message) {
  console.log("ALERT:", message);
  alertTriggered = true;
}

// ===== KILL SWITCH =====
function activateKillSwitch(reason) {
  console.log("KILL SWITCH ACTIVATED:", reason);
  killSwitch = true;
}

// ===== SIMULATION LOOP =====
setInterval(() => {

  if (killSwitch) return;

  // simulate pnl fluctuation
  pnl += (Math.random() - 0.5) * 20000;

  // ALERT CONDITIONS
  if (pnl < -0.03 * capital && !alertTriggered) {
    triggerAlert("Drawdown crossed 3%");
  }

  // KILL SWITCH CONDITIONS
  if (pnl < maxDrawdown) {
    activateKillSwitch("Max drawdown breached");
  }

}, 2000);

// ===== ROUTES =====
app.get('/', (req, res) => {
  res.json({
    capital,
    pnl,
    alertTriggered,
    killSwitch
  });
});

app.get('/status', (req, res) => {
  res.json({
    systemActive: !killSwitch,
    alert: alertTriggered,
    pnl
  });
});

app.listen(PORT, () => console.log("Risk Kill Switch Running"));
