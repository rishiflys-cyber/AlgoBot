// STEP 16: PRODUCTION HARDENING (NO LOSS FROM STEP 1–15)

// This layer adds:
// - retry logic
// - error handling
// - latency tracking
// - order safety
// - logging

require("dotenv").config();

// ===== RETRY WRAPPER =====
async function withRetry(fn, retries=3){
 for(let i=0;i<retries;i++){
  try{
   return await fn();
  }catch(e){
   if(i===retries-1) throw e;
  }
 }
}

// ===== SAFE ORDER EXECUTION =====
async function safeExecute(kite, order){
 const start = Date.now();

 try{
  const res = await withRetry(()=>kite.placeOrder("regular", order));

  const latency = Date.now() - start;
  console.log("Order Success:", order.tradingsymbol, "Latency:", latency,"ms");

  return res;

 }catch(e){
  console.log("Order Failed:", order.tradingsymbol, e.message);
  return null;
 }
}

// ===== LATENCY TRACKER =====
let latencyStats = [];

function trackLatency(ms){
 latencyStats.push(ms);
 if(latencyStats.length > 100) latencyStats.shift();
}

// ===== HEALTH CHECK =====
function systemHealth(){
 return {
  avgLatency: latencyStats.reduce((a,b)=>a+b,0)/(latencyStats.length||1),
  activeTrades: global.activeTrades?.length || 0
 };
}

// ===== PRODUCTION EXECUTION =====
async function productionOrder(kite, params){

 const start = Date.now();

 const res = await safeExecute(kite, {
  ...params,
  validity: "DAY",
  market_protection: params.market_protection || 2
 });

 const latency = Date.now() - start;
 trackLatency(latency);

 return res;
}

// ===== LOGGING =====
function logTrade(trade){
 console.log("TRADE:", JSON.stringify(trade));
}

// ===== EXPORT =====
module.exports = {
 productionOrder,
 systemHealth,
 logTrade
};
