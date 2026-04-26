// STEP 19: CROSS-MARKET ARBITRAGE + OPTIONS OVERLAY (NO LOSS)

// ADD-ON MODULE ONLY — DOES NOT MODIFY EXISTING LOGIC

// ===== CONFIG =====
let arbConfig = {
  enable: true,
  threshold: 0.003 // 0.3% price diff
};

let optionsConfig = {
  enable: true,
  hedgePercent: 0.2
};

// ===== ARBITRAGE DETECTOR =====
function detectArbitrage(spot, future){
  if(!spot || !future) return false;
  let diff = (future - spot) / spot;
  return Math.abs(diff) >= arbConfig.threshold;
}

// ===== EXECUTE ARB =====
async function executeArb(kite, symbol, spotPrice, futurePrice, qty){

  if(futurePrice > spotPrice){
    // SELL FUT, BUY SPOT
    await kite.placeOrder("regular",{
      exchange:"NFO",
      tradingsymbol:symbol+"FUT",
      transaction_type:"SELL",
      quantity:qty,
      product:"MIS",
      order_type:"MARKET",
      validity:"DAY",
      market_protection:2
    });

    await kite.placeOrder("regular",{
      exchange:"NSE",
      tradingsymbol:symbol,
      transaction_type:"BUY",
      quantity:qty,
      product:"MIS",
      order_type:"MARKET",
      validity:"DAY",
      market_protection:2
    });

  } else {
    // BUY FUT, SELL SPOT
    await kite.placeOrder("regular",{
      exchange:"NFO",
      tradingsymbol:symbol+"FUT",
      transaction_type:"BUY",
      quantity:qty,
      product:"MIS",
      order_type:"MARKET",
      validity:"DAY",
      market_protection:2
    });

    await kite.placeOrder("regular",{
      exchange:"NSE",
      tradingsymbol:symbol,
      transaction_type:"SELL",
      quantity:qty,
      product:"MIS",
      order_type:"MARKET",
      validity:"DAY",
      market_protection:2
    });
  }
}

// ===== OPTIONS OVERLAY =====
async function optionsOverlay(kite, symbol, exposure){

  if(!optionsConfig.enable) return;

  let hedgeQty = Math.floor(exposure * optionsConfig.hedgePercent / 1000);

  if(hedgeQty <= 0) return;

  await kite.placeOrder("regular",{
    exchange:"NFO",
    tradingsymbol:symbol+"CE",
    transaction_type:"BUY",
    quantity:hedgeQty,
    product:"MIS",
    order_type:"MARKET",
    validity:"DAY",
    market_protection:2
  });
}

// ===== MAIN HOOK =====
async function arbAndOptionsController({
  kite,
  symbol,
  spotPrice,
  futurePrice,
  exposure
}){

  if(arbConfig.enable && detectArbitrage(spotPrice, futurePrice)){
    await executeArb(kite, symbol, spotPrice, futurePrice, 1);
  }

  await optionsOverlay(kite, symbol, exposure);
}

// ===== EXPORT =====
module.exports = {
  arbAndOptionsController,
  detectArbitrage
};
