// === ADD NEAR TOP OF server.js (with other requires) ===
const { updateVolatility } = require('./engine/volatility');
const { detectMarketRegime } = require('./engine/regime');
const { calculateTradeQuality, shouldTrade, updateLossTracker } = require('./engine/decisionEngine');
const { getDynamicSLTP } = require('./engine/riskEngine');