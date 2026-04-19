
// ALPHA UPGRADE (Regime Filter + No Architecture Change)

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

const CONFIG = require("./config/config");

const app = express();
const kite = new KiteConnect({ api_key: process.env.KITE_API_KEY });

let access_token = process.env.ACCESS_TOKEN || null;
let activeTrades = [], lastPrice = {}, history = {};
let capital = 100000;

// 🔥 REGIME DETECTION (ALPHA LAYER)
function isTrending(prices){
  if(!prices || prices.length < 5) return false;
  let up = 0, down = 0;
  for(let i=1;i<prices.length;i++){
    if(prices[i] > prices[i-1]) up++;
    else down++;
  }
  return (up >= 3 || down >= 3); // directional bias
}

setInterval(async () => {

  if (!access_token) return;

  try {

    const prices = await kite.getLTP(CONFIG.STOCKS.map(s => `NSE:${s}`));

    for (let s of CONFIG.STOCKS) {

      let p = prices[`NSE:${s}`].last_price;
      let prev = lastPrice[s];

      if(!history[s]) history[s] = [];
      history[s].push(p);
      if(history[s].length > 6) history[s].shift();

      let signal = confirmSignal(s, unifiedSignal(p, prev, s));
      lastPrice[s] = p;

      // 🔥 ALPHA FILTER (ONLY TRENDING MARKET)
      if (!isTrending(history[s])) continue;

      if (
        signal &&
        activeTrades.length < CONFIG.MAX_TRADES &&
        canTradeSymbol(s) &&
        isSlippageSafe(prev, p)
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
    console.log(e.message);
  }

}, 3000);

app.get("/", (req,res)=>res.send("ALPHA BOT RUNNING"));
app.listen(process.env.PORT || 3000);
