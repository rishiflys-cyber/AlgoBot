// STEP 18: PORTFOLIO HEDGING + DRAWDOWN SMOOTHING (NO LOSS)

// ADD-ON MODULE ONLY — DOES NOT MODIFY EXISTING LOGIC

// ===== HEDGING CONFIG =====
let hedgeConfig = {
  enable: true,
  hedgeRatio: 0.3,   // 30% hedge
  maxDrawdownTrigger: 0.05
};

let hedgeState = {
  active: false,
  hedgePosition: null
};

// ===== CALCULATE PORTFOLIO EXPOSURE =====
function getTotalExposure(activeTrades){
  return activeTrades.reduce((acc, t)=> acc + (t.entry * t.qty), 0);
}

// ===== DRAWDOWN CALC =====
function getDrawdown(pnl, peak){
  return (peak - pnl) / (peak || 1);
}

// ===== HEDGE DECISION =====
function shouldHedge(pnl, peak){
  let dd = getDrawdown(pnl, peak);
  return dd >= hedgeConfig.maxDrawdownTrigger;
}

// ===== HEDGE EXECUTION (SIMPLIFIED) =====
async function executeHedge(kite, exposure){

  if(!hedgeConfig.enable) return;

  let hedgeQty = Math.floor(exposure * hedgeConfig.hedgeRatio / 1000);

  if(hedgeQty <= 0) return;

  await kite.placeOrder("regular",{
    exchange:"NSE",
    tradingsymbol:"NIFTY",
    transaction_type:"SELL",
    quantity:hedgeQty,
    product:"MIS",
    order_type:"MARKET",
    validity:"DAY",
    market_protection: 2
  });

  hedgeState.active = true;
  hedgeState.hedgePosition = hedgeQty;
}

// ===== UNHEDGE =====
async function removeHedge(kite){
  if(!hedgeState.active) return;

  await kite.placeOrder("regular",{
    exchange:"NSE",
    tradingsymbol:"NIFTY",
    transaction_type:"BUY",
    quantity:hedgeState.hedgePosition,
    product:"MIS",
    order_type:"MARKET",
    validity:"DAY",
    market_protection: 2
  });

  hedgeState.active = false;
  hedgeState.hedgePosition = null;
}

// ===== MAIN HOOK =====
async function hedgeController({kite, activeTrades, pnl, peakPnL}){

  let exposure = getTotalExposure(activeTrades);
  let hedgeNeeded = shouldHedge(pnl, peakPnL);

  if(hedgeNeeded && !hedgeState.active){
    await executeHedge(kite, exposure);
  }

  if(!hedgeNeeded && hedgeState.active){
    await removeHedge(kite);
  }
}

// ===== EXPORT =====
module.exports = {
  hedgeController,
  hedgeState,
  hedgeConfig
};
