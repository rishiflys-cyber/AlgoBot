
require("dotenv").config();
const express = require("express");
const path = require("path");
const { KiteConnect } = require("kiteconnect");

// ✅ SAFE IMPORTS (avoid crash if file missing)
function safeRequire(p){
  try { return require(p); } catch(e){ console.log("Missing:", p); return {}; }
}

const { unifiedSignal } = safeRequire("./strategy_unified");
const { confirmSignal } = safeRequire("./signal_confirmation");
const { safeOrderEnhanced } = safeRequire("./execution_enhanced");
const { canTradeSymbol, markTraded } = safeRequire("./symbol_cooldown");
const { getPositionSize } = safeRequire("./position_sizing");
const { markEntry, shouldExit, clear } = safeRequire("./time_exit");
const { isSlippageSafe } = safeRequire("./slippage_guard");
const { isHighQualityMove } = safeRequire("./quality_filter");
const { isMomentumStrong } = safeRequire("./momentum_strength");
const { isDrawdownSafe } = safeRequire("./drawdown_guard");

// ✅ FIXED CONFIG PATH
const CONFIG = require("./config/config");

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const kite = new KiteConnect({ api_key: process.env.KITE_API_KEY });

let access_token = process.env.ACCESS_TOKEN || null;
let activeTrades = [];
let lastPrice = {};
let history = {};
let capital = 100000;
let dailyPnL = 0;

// LOGIN
app.get("/login", (req, res) => res.redirect(kite.getLoginURL()));

app.get("/redirect", async (req, res) => {
  try {
    const session = await kite.generateSession(
      req.query.request_token,
      process.env.KITE_API_SECRET
    );
    access_token = session.access_token;
    kite.setAccessToken(access_token);
    res.send("Login Success");
  } catch (e) {
    res.send("Login Failed " + e.message);
  }
});

// LOOP (SAFE)
setInterval(async () => {

  if (!access_token) return;

  try {
    const prices = await kite.getLTP(CONFIG.STOCKS.map(s => `NSE:${s}`));

    for (let s of CONFIG.STOCKS) {

      let p = prices[`NSE:${s}`].last_price;
      let prev = lastPrice[s];

      if (!history[s]) history[s] = [];
      history[s].push(p);
      if (history[s].length > 5) history[s].shift();

      let raw = unifiedSignal?.(p, prev, s);
      let signal = confirmSignal?.(s, raw);

      lastPrice[s] = p;

      if (signal && activeTrades.length < CONFIG.MAX_TRADES) {

        let qty = getPositionSize?.(capital, p, CONFIG) || 1;

        let order = await safeOrderEnhanced?.(kite, () =>
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
          markTraded?.(s);
          markEntry?.(s);
        }
      }
    }

  } catch (e) {
    console.log("LOOP ERROR:", e.message);
  }

}, 3000);

app.get("/", (req,res)=>res.send("RUNNING"));

app.listen(process.env.PORT || 3000);
