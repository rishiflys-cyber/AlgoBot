
const express = require("express");
const { KiteConnect } = require("kiteconnect");

const app = express();
const PORT = process.env.PORT || 3000;

const kc = new KiteConnect({ api_key: process.env.API_KEY });

/* LOGIN */
app.get("/login",(req,res)=>res.redirect(kc.getLoginURL()));
app.get("/redirect", async (req,res)=>{
  const session = await kc.generateSession(req.query.request_token, process.env.API_SECRET);
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  res.send("ACCESS_TOKEN: " + session.access_token + "<br>IP: " + ip);
});

/* CONFIG */
const symbols = ["RELIANCE","INFY","TCS","HDFCBANK"];
let trades = [];
let capital = 8491.8;

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

/* 🔥 ELITE SCORING */
function scoreSignal(rsiVal, trend, momentum, volume){
  let score = 0;

  if(rsiVal < 45) score += 25;
  if(rsiVal < 40) score += 10;

  if(trend === "UP") score += 25;

  if(momentum > 0) score += 20;
  if(momentum > 0.2) score += 10;

  if(volume > 1.2) score += 10; // volume boost

  return score;
}

async function runBot(){
  try{
    kc.setAccessToken(process.env.ACCESS_TOKEN);

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
      const volumes = candles.map(c=>c.volume);

      const r = rsi(closes);
      const e20 = ema(closes,20);
      const e50 = ema(closes,50);
      const trend = e20 > e50 ? "UP" : "DOWN";

      const price = closes[closes.length-1];
      const prev = closes[closes.length-2];
      const momentum = price - prev;

      const avgVol = volumes.reduce((a,b)=>a+b,0)/volumes.length;
      const currentVol = volumes[volumes.length-1];
      const volBoost = currentVol / avgVol;

      const score = scoreSignal(r, trend, momentum, volBoost);

      candidates.push({
        symbol,
        score,
        price,
        rsi: r,
        trend,
        momentum,
        volume: volBoost
      });
    }

    // 🔥 SELECT BEST TRADE ONLY
    candidates.sort((a,b)=>b.score - a.score);
    const best = candidates[0];

    if(best && best.score >= 70){

      let existing = trades.find(t => t.symbol===best.symbol && t.status==="LIVE");

      if(!existing){

        const order = await kc.placeOrder("regular",{
          exchange:"NSE",
          tradingsymbol:best.symbol,
          transaction_type:"BUY",
          quantity:1,
          product:"MIS",
          order_type:"MARKET"
        });

        trades.push({
          symbol:best.symbol,
          entry:best.price,
          sl:best.price*0.97,
          target:best.price*1.05,
          score:best.score,
          status:"LIVE"
        });
      }
    }

    // EXIT + TRAILING
    for(let t of trades){
      if(t.status==="LIVE"){

        const q = await kc.getQuote([`NSE:${t.symbol}`]);
        const price = q[`NSE:${t.symbol}`].last_price;

        if(price <= t.sl || price >= t.target){

          await kc.placeOrder("regular",{
            exchange:"NSE",
            tradingsymbol:t.symbol,
            transaction_type:"SELL",
            quantity:1,
            product:"MIS",
            order_type:"MARKET"
          });

          let pnl = price - t.entry;
          capital += pnl;

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
    trades,
    mode:"V104_ELITE"
  });
});

app.get("/",(req,res)=>res.send("V104 ELITE RUNNING"));

app.listen(PORT,()=>console.log("V104 ELITE RUNNING"));
