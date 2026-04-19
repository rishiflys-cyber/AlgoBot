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
const { isMomentumStrong } = require("./momentum_strength");
const { isDrawdownSafe } = require("./drawdown_guard");

const CONFIG = require("./config/config");

const app = express();
const kite = new KiteConnect({ api_key: process.env.KITE_API_KEY });

let access_token = process.env.ACCESS_TOKEN || null;

let BOT_ACTIVE = false;
let MANUAL_KILL = false;

let activeTrades = [];
let lastPrice = {};
let history = {};
let scanData = [];

let capital = 100000;
let dailyPnL = 0;

// ================= LOGIN =================
app.get("/login", (req, res) => {
  res.redirect(kite.getLoginURL());
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

// ================= START / KILL =================
app.get("/start", (req, res) => {
  MANUAL_KILL = false;
  res.send("BOT STARTED");
});

app.get("/kill", (req, res) => {
  MANUAL_KILL = true;
  res.send("BOT STOPPED");
});

// ================= TIME =================
function isMarketOpen() {
  const now = new Date();
  const ist = new Date(
    now.toLocaleString("en-US", { timeZone: "Asia/Kolkata" })
  );

  const h = ist.getHours();
  const m = ist.getMinutes();
  const current = h * 60 + m;

  return current >= 560 && current < 885; // 9:20–2:45
}

// ================= ALPHA (REGIME FILTER) =================
function isTrending(arr) {
  if (!arr || arr.length < 5) return false;
  let up = 0, down = 0;

  for (let i = 1; i < arr.length; i++) {
    if (arr[i] > arr[i - 1]) up++;
    else down++;
  }

  return up >= 3 || down >= 3;
}

// ================= LOOP =================
setInterval(async () => {

  if (!access_token || MANUAL_KILL) return;

  const marketOpen = isMarketOpen();
  BOT_ACTIVE = marketOpen;

  try {

    const prices = await kite.getLTP(
      CONFIG.STOCKS.map(s => `NSE:${s}`)
    );

    scanData = [];

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
        shouldExit(t.symbol) ||
        !marketOpen
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

    if (!marketOpen) return;

    // ENTRY
    for (let s of CONFIG.STOCKS) {

      let p = prices[`NSE:${s}`].last_price;
      let prev = lastPrice[s];

      if (!history[s]) history[s] = [];
      history[s].push(p);
      if (history[s].length > 6) history[s].shift();

      let signal = confirmSignal(s, unifiedSignal(p, prev, s));
      lastPrice[s] = p;

      scanData.push({
        symbol: s,
        price: p,
        signal: signal || null
      });

      // 🔥 ALPHA FILTER
      if (!isTrending(history[s])) continue;

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
    console.log("ERROR:", e.message);
  }

}, 3000);

// ================= DASHBOARD =================
app.get("/", (req, res) => {
  res.json({
    capital,
    dailyPnL,
    activeTrades,
    scan: scanData
  });
});

app.get("/performance", (req, res) => {
  res.json({
    capital,
    dailyPnL,
    activeTradesCount: activeTrades.length,
    botActive: BOT_ACTIVE,
    scan: scanData
  });
});

// ================= START =================
app.listen(process.env.PORT || 3000);