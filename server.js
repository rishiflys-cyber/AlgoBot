
// UPGRADE 9: Intraday Drawdown Guard (NO LOGIC CHANGE)

require("dotenv").config();
const express = require("express");
const { KiteConnect } = require("kiteconnect");

const { unifiedSignal } = require("./strategy_unified");
const { confirmSignal } = require("./signal_confirmation");
const { safeOrderEnhanced } = require("./execution_enhanced");
const { canTradeSymbol, markTraded } = require("./symbol_cooldown");
const { getPositionSize } = require("./position_sizing");
const { markEntry, shouldExit, clear } = require("./time_exit");
const { isSlippageSafe } = require("./slippage_guard");
const { isHighQualityMove } = require("./quality_filter");
const { isDrawdownSafe, updatePnL } = require("./drawdown_guard");

const CONFIG = require("./config");

const app = express();
const kite = new KiteConnect({ api_key: process.env.KITE_API_KEY });

let access_token = process.env.ACCESS_TOKEN || null;
let activeTrades = [], lastPrice = {};
let capital = 100000, dailyPnL = 0;

setInterval(async () => {

  if (!access_token) return;

  try {

    const prices = await kite.getLTP(CONFIG.STOCKS.map(s => `NSE:${s}`));

    // EXIT
    activeTrades = activeTrades.filter(t => {
      let p = prices[`NSE:${t.symbol}`].last_price;
      let pnl = t.type === "BUY" ? (p - t.entry)/t.entry : (t.entry - p)/t.entry;

      if (shouldExit(t.symbol)) {
        updatePnL(pnl, capital);
        clear(t.symbol);
        return false;
      }
      return true;
    });

    for (let s of CONFIG.STOCKS) {

      let p = prices[`NSE:${s}`].last_price;
      let prev = lastPrice[s];

      let raw = unifiedSignal(p, prev, s);
      let signal = confirmSignal(s, raw);

      lastPrice[s] = p;

      if (
        signal &&
        activeTrades.length < CONFIG.MAX_TRADES &&
        isDrawdownSafe(dailyPnL, capital) &&
        canTradeSymbol(s) &&
        isSlippageSafe(prev, p) &&
        isHighQualityMove(prev, p)
      ) {

        let qty = getPositionSize(capital, p, CONFIG);

        let order = await safeOrderEnhanced(kite, () =>
          kite.placeOrder("regular", {
            exchange: "NSE",
            tradingsymbol: s,
            transaction_type: signal,
            quantity: qty,
            product: "MIS",
            order_type: "MARKET"
          })
        );

        if (order) {
          activeTrades.push({ symbol: s, type: signal, entry: p, qty });
          markTraded(s);
          markEntry(s);
        }
      }
    }

  } catch (e) {
    console.error(e.message);
  }

}, 3000);

app.listen(process.env.PORT || 3000);
