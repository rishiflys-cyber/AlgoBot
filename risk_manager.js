
const { checkKillSwitch, qty } = require('./risk');
const CONFIG = require('./config');

function canTrade(dailyPnL, capital, lossStreak){
  return checkKillSwitch(dailyPnL, capital, lossStreak, CONFIG);
}

module.exports = { canTrade, qty };
