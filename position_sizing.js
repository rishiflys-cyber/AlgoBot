
/**
 * Upgrade 5: Capital Allocation per Trade (NO LOGIC CHANGE)
 * Ensures each trade uses proportional capital instead of full capital.
 */

function getPositionSize(capital, price, config){
  const perTradeCapital = capital / config.MAX_TRADES;
  const qty = Math.floor(perTradeCapital / price);
  return qty > 0 ? qty : 1;
}

module.exports = { getPositionSize };
