// FULL SERVER WITH UPGRADE 7 INCLUDED
// (same as previous but ensured slippage + all integrations)

require("dotenv").config();
const express = require("express");
const path = require("path");
const { KiteConnect } = require("kiteconnect");

const { unifiedSignal } = require("./strategy_unified");
const { confirmSignal } = require("./signal_confirmation");
const { canTrade } = require("./risk_manager");
const { safeOrderEnhanced } = require("./execution_enhanced");
const { canTradeSymbol, markTraded } = require("./symbol_cooldown");
const { getPositionSize } = require("./position_sizing");
const { markEntry, shouldExit, clear } = require("./time_exit");
const { isSlippageSafe } = require("./slippage_guard");
const CONFIG = require("./config");

const app = express();
app.use(express.json());

const kite = new KiteConnect({ api_key: process.env.KITE_API_KEY });

let access_token = process.env.ACCESS_TOKEN || null;
let BOT_ACTIVE = false;

let activeTrades = [], lastPrice = {};
let capital = 100000, lossStreak = 0, dailyPnL = 0;

setInterval(async () => {

  if (!access_token) return;

  try {

    const prices = await kite.getLTP(CONFIG.STOCKS.map(s => `NSE:${s}`));

    for (let s of CONFIG.STOCKS) {

      let p = prices[`NSE:${s}`].last_price;
      let prev = lastPrice[s];

      let raw = unifiedSignal(p, prev, s);
      let signal = confirmSignal(s, raw);

      lastPrice[s] = p;

      if (signal && activeTrades.length < CONFIG.MAX_TRADES &&
          canTradeSymbol(s) && isSlippageSafe(prev, p)) {

        let quantity = getPositionSize(capital, p, CONFIG);

        let order = await safeOrderEnhanced(kite, () =>
          kite.placeOrder("regular", {
            exchange: "NSE",
            tradingsymbol: s,
            transaction_type: signal,
            quantity: quantity,
            product: "MIS",
            order_type: "MARKET"
          })
        );

        if (order) {
          activeTrades.push({ symbol: s, type: signal, entry: p, qty: quantity });
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
