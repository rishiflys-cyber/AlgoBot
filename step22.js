// STEP 22: CAPITAL SCALING + PNL ENGINE (ADD-ON, NO LOSS)

// ===== CAPITAL SCALING CONFIG =====
let capitalConfig = {
  targetMonthly: 100000, // ₹1L target
  riskPerTrade: 0.02,
  maxCapitalUsage: 0.6
};

// ===== PNL ENGINE =====
let pnlEngine = {
  daily: 0,
  weekly: 0,
  monthly: 0,
  lastReset: new Date()
};

// ===== UPDATE PNL =====
function updatePnL(tradePnL){
  pnlEngine.daily += tradePnL;
  pnlEngine.weekly += tradePnL;
  pnlEngine.monthly += tradePnL;
}

// ===== RESET LOGIC =====
function resetPnL(){
  let now = new Date();

  if(now.getDate() !== pnlEngine.lastReset.getDate()){
    pnlEngine.daily = 0;
  }

  if(now.getDay() === 1){ // Monday
    pnlEngine.weekly = 0;
  }

  if(now.getMonth() !== pnlEngine.lastReset.getMonth()){
    pnlEngine.monthly = 0;
  }

  pnlEngine.lastReset = now;
}

// ===== CAPITAL SCALING =====
function getDynamicRisk(capital){
  let base = capitalConfig.riskPerTrade;

  if(pnlEngine.monthly > capitalConfig.targetMonthly * 0.5){
    return base * 0.5; // reduce risk after good profit
  }

  if(pnlEngine.monthly < 0){
    return base * 0.7; // reduce risk in drawdown
  }

  return base;
}

// ===== POSITION SIZE =====
function calculatePositionSize(capital, price){
  let risk = getDynamicRisk(capital);
  let usableCapital = capital * capitalConfig.maxCapitalUsage;
  return Math.max(1, Math.floor((usableCapital * risk) / price));
}

// ===== TARGET TRACKER =====
function getTargetStatus(){
  return {
    monthlyTarget: capitalConfig.targetMonthly,
    achieved: pnlEngine.monthly,
    progress: (pnlEngine.monthly / capitalConfig.targetMonthly) * 100
  };
}

// ===== EXPORT =====
module.exports = {
  updatePnL,
  resetPnL,
  calculatePositionSize,
  getTargetStatus,
  pnlEngine
};
