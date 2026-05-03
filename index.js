
const express = require("express");
const { KiteConnect } = require("kiteconnect");

const app = express();
const PORT = process.env.PORT || 3000;

const kc = new KiteConnect({ api_key: process.env.API_KEY });

/* LOGIN WITH IP FIX */
app.get("/login",(req,res)=>res.redirect(kc.getLoginURL()));

app.get("/redirect", async (req,res)=>{
  try{
    const session = await kc.generateSession(
      req.query.request_token,
      process.env.API_SECRET
    );

    const ip =
      req.headers['x-forwarded-for'] ||
      req.socket.remoteAddress ||
      req.connection.remoteAddress ||
      "IP_NOT_FOUND";

    res.send("ACCESS_TOKEN: " + session.access_token + "<br>IP: " + ip);

  }catch(e){
    res.send("Error: " + e.message);
  }
});

/* CONFIG */
const symbols = ["RELIANCE","INFY","TCS","HDFCBANK"];
let trades = [];
let capital = 8491.8;

const RISK_PER_TRADE = 0.02;
const MAX_DAILY_LOSS = 0.05;
let dailyPnL = 0;

/* INDICATORS */
function rsi(closes){
  let g=0,l=0;
  for(let i=1;i<closes.length;i++){
    let d=closes[i]-closes[i-1];
    if(d>0) g+=d; else l-=d;
  }
  let rs=g/(l||1);
  return 100-(100/(1+rs));
}

function ema(data,p){
  let k=2/(p+1), e=data[0];
  for(let i=1;i<data.length;i++) e=data[i]*k+e*(1-k);
  return e;
}

function scoreSignal(rsiVal, trend, momentum){
  let score = 0;
  if(rsiVal < 45) score += 30;
  if(trend === "UP") score += 30;
  if(momentum > 0) score += 20;
  return score;
}

/* FUND MODE ENGINE */
async function runBot(){
  try{
    kc.setAccessToken(process.env.ACCESS_TOKEN);

    if(dailyPnL <= -capital * MAX_DAILY_LOSS){
      console.log("STOPPED: Max loss hit");
      return;
    }

    const instrumentMap = {
      "RELIANCE": 738561,
      "INFY": 408065,
      "TCS": 2953217,
      "HDFCBANK": 341249
    };

    let candidates = [];

    for(let symbol of symbols){

      const inst = instrumentMap[symbol];
      const now = new Date();
      const from = new Date(now.getTime() - 60*60*1000);

      const candles = await kc.getHistoricalData(inst, from, now, "5minute");
      if(!candles || candles.length < 20) continue;

      const closes = candles.map(c=>c.close);

      const r = rsi(closes);
      const e20 = ema(closes,20);
      const e50 = ema(closes,50);
      const trend = e20 > e50 ? "UP" : "DOWN";

      const price = closes[closes.length-1];
      const prev = closes[closes.length-2];
      const momentum = price - prev;

      const score = scoreSignal(r, trend, momentum);

      candidates.push({symbol, score, price});
    }

    candidates.sort((a,b)=>b.score - a.score);

    // 🔥 TAKE TOP 2 TRADES (SCALING)
    const topTrades = candidates.slice(0,2);

    for(let best of topTrades){

      if(best.score < 60) continue;

      let existing = trades.find(t => t.symbol===best.symbol && t.status==="LIVE");

      if(!existing){

        let riskAmount = capital * RISK_PER_TRADE;
        let slDistance = best.price * 0.03;
        let qty = Math.max(1, Math.floor(riskAmount / slDistance));

        await kc.placeOrder("regular",{
          exchange:"NSE",
          tradingsymbol:best.symbol,
          transaction_type:"BUY",
          quantity:qty,
          product:"MIS",
          order_type:"MARKET"
        });

        trades.push({
          symbol:best.symbol,
          entry:best.price,
          qty,
          sl:best.price*0.97,
          target:best.price*1.05,
          status:"LIVE"
        });
      }
    }

    // EXIT + PARTIAL PROFIT
    for(let t of trades){
      if(t.status==="LIVE"){

        const q = await kc.getQuote([`NSE:${t.symbol}`]);
        const price = q[`NSE:${t.symbol}`].last_price;

        // PARTIAL EXIT
        if(price > t.entry*1.02 && !t.partial){
          await kc.placeOrder("regular",{
            exchange:"NSE",
            tradingsymbol:t.symbol,
            transaction_type:"SELL",
            quantity:Math.floor(t.qty/2),
            product:"MIS",
            order_type:"MARKET"
          });

          t.partial = true;
        }

        if(price <= t.sl || price >= t.target){

          await kc.placeOrder("regular",{
            exchange:"NSE",
            tradingsymbol:t.symbol,
            transaction_type:"SELL",
            quantity:t.qty,
            product:"MIS",
            order_type:"MARKET"
          });

          let pnl = (price - t.entry) * t.qty;
          capital += pnl;
          dailyPnL += pnl;

          t.status = "CLOSED";
          t.exit = price;
          t.pnl = pnl;
        }

        if(price > t.entry*1.01){
          t.sl = price*0.997;
        }
      }
    }

  }catch(e){
    console.log(e.message);
  }
}

setInterval(runBot,10000);

/* ROUTES */
app.get("/performance",(req,res)=>{
  res.json({
    capital,
    dailyPnL,
    trades,
    mode:"V106_FUND"
  });
});

app.listen(PORT,()=>console.log("V106 FUND MODE RUNNING"));
