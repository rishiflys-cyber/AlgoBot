
// FINAL FULL SERVER (NO LOGIC CHANGE, ALL FEATURES RESTORED + STABLE)

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

let access_token = null;
let MANUAL_KILL = false;

let capital = 100000;
let dailyPnL = 0;
let activeTrades = [];
let lastPrice = {};
let history = {};
let scanData = [];

// LOGIN
app.get("/login", (req,res)=>res.redirect(kite.getLoginURL()));

app.get("/redirect", async (req,res)=>{
 try{
  const s = await kite.generateSession(req.query.request_token, process.env.KITE_API_SECRET);
  access_token = s.access_token;
  kite.setAccessToken(access_token);
  res.send("Login Success");
 }catch(e){res.send(e.message);}
});

// START/KILL
app.get("/start",(req,res)=>{MANUAL_KILL=false;res.send("STARTED");});
app.get("/kill",(req,res)=>{MANUAL_KILL=true;res.send("STOPPED");});

// CAPITAL
async function syncCapital(){
 try{
  const m = await kite.getMargins();
  const cash = m?.equity?.available?.cash || m?.equity?.net || 0;
  if(cash>0) capital=cash;
 }catch{}
}

// LOOP
setInterval(async ()=>{
 if(!access_token || MANUAL_KILL) return;

 try{
  await syncCapital();

  const prices = await kite.getLTP(CONFIG.STOCKS.map(s=>`NSE:${s}`));
  scanData=[];

  for(let s of CONFIG.STOCKS){
    let p = prices[`NSE:${s}`].last_price;
    let prev = lastPrice[s];

    if(!history[s]) history[s]=[];
    history[s].push(p);
    if(history[s].length>6) history[s].shift();

    let raw = unifiedSignal(p,prev,s);
    let signal = confirmSignal(s,raw) || raw;

    lastPrice[s]=p;

    scanData.push({symbol:s,price:p,signal});

    if(signal && activeTrades.length<CONFIG.MAX_TRADES &&
       isDrawdownSafe(dailyPnL,capital) &&
       canTradeSymbol(s) &&
       isSlippageSafe(prev,p) &&
       isHighQualityMove(prev,p) &&
       isMomentumStrong(history[s])){

        let qty = getPositionSize(capital,p,CONFIG);

        let order = await safeOrderEnhanced(kite, ()=>kite.placeOrder("regular",{
          exchange:"NSE",tradingsymbol:s,transaction_type:signal,
          quantity:qty,product:"MIS",order_type:"MARKET"
        }));

        if(order){
          activeTrades.push({symbol:s,type:signal,entry:p,qty});
          markTraded(s); markEntry(s);
        }
    }
  }

 }catch(e){console.log(e.message);}
},3000);

// DASHBOARD
app.get("/performance",(req,res)=>{
 res.json({capital,dailyPnL,activeTradesCount:activeTrades.length,scan:scanData});
});

app.get("/",(req,res)=>res.send("BOT RUNNING"));

app.listen(process.env.PORT||3000);
