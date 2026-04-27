async function runLiveEngine(stocks, capital, kc) {
  const MAX_TRADES = 3;
  const RISK_PER_TRADE = 0.01;

  let trades = [];

  stocks.sort((a, b) => b.score - a.score);

  const selected = stocks.slice(0, MAX_TRADES);

  for (let stock of selected) {
    const riskAmount = capital * RISK_PER_TRADE;

    const sl = stock.price * 0.98;
    const qty = Math.floor(riskAmount / (stock.price - sl));

    if (qty <= 0) continue;

    try {
      await kc.placeOrder("regular", {
        exchange: "NSE",
        tradingsymbol: stock.symbol.replace("NSE:", ""),
        transaction_type: "BUY",
        quantity: qty,
        order_type: "MARKET",
        product: "MIS",
      });

      trades.push({
        symbol: stock.symbol,
        qty,
        entry: stock.price,
        sl,
      });
    } catch (err) {
      console.log("Order error:", err.message);
    }
  }

  return trades;
}

module.exports = runLiveEngine;