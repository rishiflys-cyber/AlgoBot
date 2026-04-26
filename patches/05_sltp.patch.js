// === REPLACE FIXED SL/TP ===
// OLD:
// const stopLoss = price * 0.998;
// const target = price * 1.003;

// NEW:
const { stopLoss, target } = getDynamicSLTP(symbol, price);