function checkKillSwitch(dailyPnL, capital, lossStreak, CONFIG){
  if(dailyPnL <= CONFIG.MAX_DD * capital) return false;
  if(lossStreak >= CONFIG.MAX_LOSS_STREAK) return false;
  return true;
}

function qty(capital, price, CONFIG){
  let risk = capital * CONFIG.RISK;
  let sl = price * CONFIG.SL;
  return Math.max(1, Math.floor(risk / sl));
}

module.exports = { checkKillSwitch, qty };