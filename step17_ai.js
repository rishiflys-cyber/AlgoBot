// STEP 17: AI ADAPTIVE LEARNING (VERIFIED WORKING VERSION)
// PRESERVES STEP 1–16 (THIS IS ADD-ON MODULE ONLY)

// ===== ADAPTIVE ENGINE =====
let strategyPerformance = {
  momentum: { pnl: 0, trades: 0 },
  meanReversion: { pnl: 0, trades: 0 }
};

let strategyWeights = {
  momentum: 0.5,
  meanReversion: 0.5
};

// ===== UPDATE PERFORMANCE =====
function updateStrategyPerformance(strategy, pnl){
  if(!strategyPerformance[strategy]) return;
  strategyPerformance[strategy].pnl += pnl;
  strategyPerformance[strategy].trades += 1;
}

// ===== RECALIBRATE WEIGHTS =====
function recalculateWeights(){
  let total = 0;

  for(let s in strategyPerformance){
    let perf = strategyPerformance[s];
    let score = perf.trades ? perf.pnl / perf.trades : 0;
    strategyWeights[s] = Math.max(0.01, score + 1); // shift positive
    total += strategyWeights[s];
  }

  // normalize
  for(let s in strategyWeights){
    strategyWeights[s] /= total;
  }
}

// ===== WEIGHTED STRATEGY PICK =====
function weightedStrategySelection(){
  let r = Math.random();
  let cumulative = 0;

  for(let s in strategyWeights){
    cumulative += strategyWeights[s];
    if(r <= cumulative) return s;
  }

  return "momentum";
}

// ===== INTEGRATION HOOK =====
// Replace your strategy selector with this:

/*
let strategy = weightedStrategySelection();
*/

// ===== EXPORT =====
module.exports = {
  updateStrategyPerformance,
  recalculateWeights,
  weightedStrategySelection,
  strategyWeights,
  strategyPerformance
};
