// STEP 15 REAL: FULL INTEGRATION PATCH (NO REMOVAL)

// This version keeps architecture generic but shows ALL required wiring points correctly.
// You must merge into your base file if already existing.

// ===== SAFE MARKET PROTECTION =====
function safeMarketProtection(val){
 if(!val || val < 2) return 2;
 if(val > 100) return 100;
 return val;
}

// ===== PATCH: EXECUTION WRAPPER =====
async function executeOrderPatched(kite, params){
 return await kite.placeOrder("regular", {
   ...params,
   market_protection: safeMarketProtection(params.market_protection || 0),
   validity: "DAY"
 });
}

// ===== PATCH: SMART ROUTING =====
async function smartOrderRoute(kite, params){
 let qty = params.quantity;
 let slices = qty > 5 ? Math.ceil(qty/2) : qty;

 for(let i=0;i<qty;i+=slices){
   await executeOrderPatched(kite, {
     ...params,
     quantity: Math.min(slices, qty-i)
   });
 }
}

// ===== PATCH: RISK GATE =====
function enforceRiskGate(riskGateFn, symbol, price, qty){
 return riskGateFn ? riskGateFn(symbol, price, qty) : true;
}

// ===== PATCH: AUTO FILTER =====
function enforceAutoFilter(filterFn, quality, prob){
 return filterFn ? filterFn(quality, prob) : true;
}

// ===== PATCH: MICROSTRUCTURE =====
function enforceMicrostructure(microFn, symbol){
 return microFn ? microFn(symbol) : true;
}

// ===== PATCH: DRAW DOWN BLOCK =====
function enforceDrawdown(drawdownFn){
 return drawdownFn ? drawdownFn() : false;
}

// ===== PATCH: STRATEGY ENGINE =====
function getSignalFromStrategy(runStrategies, pickBestSignal, context){
 if(!runStrategies || !pickBestSignal) return null;
 const signals = runStrategies(context);
 return pickBestSignal(signals);
}

// ===== PATCH: SHADOW ENGINE =====
function processShadow(shadowFn, symbol, price, signal, qty){
 if(shadowFn) shadowFn(symbol, price, signal, qty);
}

// ===== INTEGRATION TEMPLATE =====
async function integratedExecution({
 kite,
 symbol,
 price,
 qty,
 signal,
 context,
 engines
}){

 if(!signal) return;

 if(enforceDrawdown(engines.drawdown)) return;

 if(!enforceAutoFilter(engines.autoFilter, context.quality, context.prob)) return;

 if(!enforceMicrostructure(engines.microstructure, symbol)) return;

 if(!enforceRiskGate(engines.riskGate, symbol, price, qty)) return;

 processShadow(engines.shadowEntry, symbol, price, signal, qty);

 await smartOrderRoute(kite, {
   exchange: "NSE",
   tradingsymbol: symbol,
   transaction_type: signal,
   quantity: qty,
   product: "MIS",
   order_type: "MARKET"
 });
}

// ===== NOTE =====
// This file is PATCH LOGIC ONLY.
// You must inject:
// - replace all kite.placeOrder → smartOrderRoute
// - add safeMarketProtection globally
// - wrap entry point with integratedExecution
