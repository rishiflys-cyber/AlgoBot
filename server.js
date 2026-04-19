require("dotenv").config();
const express = require("express");
const path = require("path");
const { KiteConnect } = require("kiteconnect");

const { unifiedSignal } = require("./strategy_unified");
const { confirmSignal } = require("./signal_confirmation");
const { safeOrderEnhanced } = require("./execution_enhanced");
const { canTradeSymbol, markTraded } = require("./symbol_cooldown");
const { getPositionSize } = require("./position_sizing");
const { markEntry, shouldExit, clear } = require("./time_exit");
const { isSlippageSafe } = require("./slippage_guard");
const { isHighQualityMove } = require("./quality_filter");
const { isMomentumStrong } = require("./momentum_strength");
const { isDrawdownSafe } = require("./drawdown_guard");
const CONFIG = require("./config");

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const kite = new KiteConnect({ api_key: process.env.KITE_API_KEY });

let access_token = process.env.ACCESS_TOKEN || null;
let BOT_ACTIVE = true;

let activeTrades = [];
let lastPrice = {};
let history = {};

let capital = 100000;
let dailyPnL = 0;

// ================= LOGIN =================

app.get("/login", (req, res) => {
  try {
    return res.redirect(kite.getLoginURL());
  } catch (e) {
    res.send("Login error: " + e.message);
  }
});

app.get("/redirect", async (req, res) => {
  try {
    const session = await kite.generateSession(
      req.query.request_token,
      process.env.KITE_API_SECRET
    );

    access_token = session.access_token;
    kite.setAccessToken(access_token);

    res.send("Login Success ✅");
  } catch (e) {
    res.send("Login Failed ❌ " + e.message);
  }
});

// ================= CAPITAL =================

async function syncCapital() {
  try {
    const margins = await kite.getMargins();
    const cash =
      margins?.equity?.net ||
      margins?.equity?.available?.cash ||
      0;

    if (cash > 0) capital = cash;
  } catch (e) {
    console.log("Capital sync failed");
  }
}

// ================= TRADING LOOP =================

setInterval(async () => {

  if (!access_token || !BOT_ACTIVE) return;

  try {
    await syncCapital();

    const prices = await kite.getLTP(
      CONFIG.STOCKS.map(s => `NSE:${s}`)
    );

    // EXIT
    activeTrades = activeTrades.filter(t => {
      let p = prices[`NSE:${t.symbol}`].last_price;

      let pnl =
        t.type === "BUY"
          ? (p - t.entry) / t.entry
          : (t.entry - p) / t.entry;

      if (
        pnl >= CONFIG.TP ||
        pnl <= -CONFIG.SL ||
        shouldExit(t.symbol)
      ) {
        safeOrderEnhanced(kite, () =>
          kite.placeOrder("regular", {
            exchange: "NSE",
            tradingsymbol: t.symbol,
            transaction_type: t.type === "BUY" ? "SELL" : "BUY",
            quantity: t.qty,
            product: "MIS",
            order_type: "MARKET"
          })
        );

        clear(t.symbol);
        dailyPnL += pnl * capital;

        return false;
      }

      return true;
    });

    // ENTRY
    for (let s of CONFIG.STOCKS) {

      let p = prices[`NSE:${s}`].last_price;
      let prev = lastPrice[s];

      if (!history[s]) history[s] = [];
      history[s].push(p);
      if (history[s].length > 5) history[s].shift();

      let raw = unifiedSignal(p, prev, s);
      let signal = confirmSignal(s, raw);

      lastPrice[s] = p;

      if (
        signal &&
        activeTrades.length < CONFIG.MAX_TRADES &&
        isDrawdownSafe(dailyPnL, capital) &&
        canTradeSymbol(s) &&
        isSlippageSafe(prev, p) &&
        isHighQualityMove(prev, p) &&
        isMomentumStrong(history[s])
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
          activeTrades.push({
            symbol: s,
            type: signal,
            entry: p,
            qty
          });

          markTraded(s);
          markEntry(s);
        }
      }
    }

  } catch (e) {
    console.error("LOOP ERROR:", e.message);
  }

}, 3000);

// ================= DASHBOARD =================

app.get("/", (req, res) => {
  res.json({
    capital,
    dailyPnL,
    activeTrades
  });
});

app.get("/status", (req, res) => {
  res.json({
    capital,
    dailyPnL,
    activeTradesCount: activeTrades.length,
    botActive: BOT_ACTIVE
  });
});

// ================= START =================

app.listen(process.env.PORT || 3000, () => {
  console.log("SERVER RUNNING");
});