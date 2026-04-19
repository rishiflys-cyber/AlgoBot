
require("dotenv").config();
const express = require("express");
const path = require("path");
const { KiteConnect } = require("kiteconnect");

const { unifiedSignal } = require("./strategy_unified");
const { confirmSignal } = require("./signal_confirmation");
const { canTrade, } = require("./risk_manager");
const { safeOrderEnhanced } = require("./execution_enhanced");
const { canTradeSymbol, markTraded } = require("./symbol_cooldown");
const { getPositionSize } = require("./position_sizing");
const { markEntry, shouldExit, clear } = require("./time_exit");
const { isSlippageSafe } = require("./slippage_guard");
const CONFIG = require("./config");

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const kite = new KiteConnect({ api_key: process.env.KITE_API_KEY });

// TIME
const getIST = () =>
  new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));

const minutesNow = () => {
  const n = getIST();
  return n.getHours() * 60 + n.getMinutes();
};

const isMarketOpen = () => {
  const min = minutesNow();
  return min >= (9 * 60 + 20) && min <= (15 * 60 + 20);
};

// STATE
let access_token = process.env.ACCESS_TOKEN || null;
let BOT_ACTIVE = false;

let activeTrades = [], lastPrice = {}, lastScan = [];
let capital = 100000, lossStreak = 0, dailyPnL = 0;

// AUTO TIMES
const AUTO_START_MIN = 9 * 60 + 20;
const AUTO_EXIT_MIN  = 15 * 60 + 20;

// CAPITAL
async function syncCapital() {
  try {
    const margins = await kite.getMargins();
    const holdings = await kite.getHoldings();
    const positions = await kite.getPositions();

    let cash =
      margins?.equity?.net ||
      margins?.equity?.available?.live_balance ||
      margins?.equity?.available?.cash || 0;

    let holdingsValue = holdings.reduce((sum, h) => sum + ((h.last_price || 0) * (h.quantity || 0)), 0);
    let pnl = (positions?.net || []).reduce((sum, p) => sum + (p.pnl || 0), 0);

    let total = cash + holdingsValue + pnl;
    if (total > 0) capital = total;

  } catch (e) {
    console.error("CAPITAL SYNC FAILED:", e.message);
  }
}

// LOGIN
app.get("/login", (req, res) => res.redirect(kite.getLoginURL()));

app.get("/redirect", async (req, res) => {
  try {
    const session = await kite.generateSession(req.query.request_token, process.env.KITE_API_SECRET);
    access_token = session.access_token;
    kite.setAccessToken(access_token);
    process.env.ACCESS_TOKEN = access_token;

    await syncCapital();
    res.send("LOGIN SUCCESS");
  } catch {
    res.send("LOGIN FAILED");
  }
});

// SQUARE OFF
async function squareOffAll(pricesMap) {
  for (let t of activeTrades) {
    await safeOrderEnhanced(kite, () =>
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
  }
  activeTrades = [];
  BOT_ACTIVE = false;
}

// LOOP
setInterval(async () => {

  if (!BOT_ACTIVE && access_token && minutesNow() >= AUTO_START_MIN && minutesNow() < AUTO_EXIT_MIN) {
    BOT_ACTIVE = true;
  }

  if (!access_token) return;

  try {
    await syncCapital();

    const prices = await kite.getLTP(CONFIG.STOCKS.map(s => `NSE:${s}`));
    lastScan = [];

    for (let s of CONFIG.STOCKS) {
      let p = prices[`NSE:${s}`].last_price;
      let prev = lastPrice[s];

      let raw = unifiedSignal(p, prev, s);
      let signal = confirmSignal(s, raw);

      lastScan.push({ symbol: s, price: p, signal });
      lastPrice[s] = p;
    }

    if (minutesNow() >= AUTO_EXIT_MIN) {
      await squareOffAll(prices);
      return;
    }

    if (!BOT_ACTIVE || !isMarketOpen()) return;
    if (!canTrade(dailyPnL, capital, lossStreak)) return;

    // EXIT LOGIC
    activeTrades = activeTrades.filter(t => {
      let p = prices[`NSE:${t.symbol}`].last_price;
      let pnl = t.type === "BUY" ? (p - t.entry)/t.entry : (t.entry - p)/t.entry;

      if (pnl >= CONFIG.TP || pnl <= -CONFIG.SL || shouldExit(t.symbol)) {
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
        return false;
      }
      return true;
    });

    // ENTRY
    for (let s of CONFIG.STOCKS) {
      let p = prices[`NSE:${s}`].last_price;
      let prev = lastPrice[s];

      let raw = unifiedSignal(p, prev, s);
      let signal = confirmSignal(s, raw);

      if (signal && activeTrades.length < CONFIG.MAX_TRADES && canTradeSymbol(s) && isSlippageSafe(prev, p)) {

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
    console.error("LOOP ERROR:", e.message);
  }

}, 3000);

// ROUTES
app.get("/status", (req, res) => res.json({ capital, dailyPnL, activeTrades, scan: lastScan }));
app.get("/performance", (req, res) => res.json({ capital, dailyPnL, lossStreak, activeTradesCount: activeTrades.length, botActive: BOT_ACTIVE }));

app.listen(process.env.PORT || 3000);
