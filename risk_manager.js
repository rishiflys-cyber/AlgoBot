// FIXED PATH VERSION — adjust path if needed

// TRY THIS FIRST (same folder)
let riskModule;
try {
  riskModule = require('./risk');
} catch (e) {
  try {
    // fallback: if inside /risk folder
    riskModule = require('./risk/risk');
  } catch (e2) {
    try {
      // fallback: if inside /core folder
      riskModule = require('./core/risk');
    } catch (e3) {
      console.error("❌ Cannot locate risk.js. Check folder structure.");
      throw e3;
    }
  }
}

const { checkKillSwitch, qty } = riskModule;
const CONFIG = require('./config');

function canTrade(dailyPnL, capital, lossStreak){
  return checkKillSwitch(dailyPnL, capital, lossStreak, CONFIG);
}

module.exports = { canTrade, qty };