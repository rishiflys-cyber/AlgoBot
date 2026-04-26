// STEP 20: EXECUTION ALPHA (SLIPPAGE + FILL + LATENCY EDGE)
// ADD-ON MODULE — NO CHANGE TO EXISTING LOGIC

// ===== CONFIG =====
let executionConfig = {
  maxSlippagePct: 0.002,   // 0.2%
  useLimitOrders: true,
  retryAttempts: 2
};

// ===== SLIPPAGE CALC =====
function calculateLimitPrice(price, side){
  let slip = price * executionConfig.maxSlippagePct;
  return side === "BUY" ? price + slip : price - slip;
}

// ===== SMART ORDER TYPE =====
function buildOrderParams(base){
  let price = base.price;
  let side = base.transaction_type;

  if(executionConfig.useLimitOrders){
    return {
      ...base,
      order_type: "LIMIT",
      price: calculateLimitPrice(price, side)
    };
  }

  return {
    ...base,
    order_type: "MARKET",
    market_protection: 2
  };
}

// ===== LATENCY TRACKER =====
let latencyLog = [];

function recordLatency(ms){
  latencyLog.push(ms);
  if(latencyLog.length > 200) latencyLog.shift();
}

function avgLatency(){
  if(latencyLog.length === 0) return 0;
  return latencyLog.reduce((a,b)=>a+b,0)/latencyLog.length;
}

// ===== EXECUTION ENGINE =====
async function executeWithAlpha(kite, order){

  let params = buildOrderParams(order);

  for(let i=0;i<executionConfig.retryAttempts;i++){
    let start = Date.now();
    try{
      let res = await kite.placeOrder("regular",{
        ...params,
        validity:"DAY"
      });

      let latency = Date.now() - start;
      recordLatency(latency);

      return res;

    }catch(e){
      if(i === executionConfig.retryAttempts-1){
        console.log("Execution Failed:", e.message);
        return null;
      }
    }
  }
}

// ===== SMART EXECUTION DECISION =====
function executionDecision(spread, volatility){

  if(spread > 0.003){
    executionConfig.useLimitOrders = false; // fast execution
  } else if(volatility < 0.002){
    executionConfig.useLimitOrders = true; // precision
  }

}

// ===== EXPORT =====
module.exports = {
  executeWithAlpha,
  executionDecision,
  avgLatency
};
