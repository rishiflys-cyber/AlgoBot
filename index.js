
const express = require("express");
const { KiteConnect } = require("kiteconnect");

const app = express();
const PORT = process.env.PORT || 3000;

const kc = new KiteConnect({ api_key: process.env.API_KEY });

const symbols = ["RELIANCE","INFY","TCS","HDFCBANK"];
let trades = [];
let capital = 8491.8;

function calculateRSI(closes){
  let gains=0, losses=0;
  for(let i=1;i<closes.length;i++){
    let diff = closes[i]-closes[i-1];
    if(diff>0) gains+=diff;
    else losses-=diff;
  }
  let rs = gains/(losses||1);
  return 100 - (100/(1+rs));
}

function ema(data, period){
  let k = 2/(period+1);
  let e = data[0];
  for(let i=1;i<data.length;i++){
    e = data[i]*k + e*(1-k);
  }
  return e;
}

function getSmartSignal(rsi, trend, price, prevPrice){
  let momentum = price - prevPrice;

  if(rsi < 45 && trend === "UP" && momentum > 0){
    return "BUY";
  }

  if(rsi > 55 && trend === "DOWN" && momentum < 0){
    return "SELL";
  }

  return "SKIP";
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

    for(let symbol of symbols){

      const instrument = instrumentMap[symbol];

      const now = new Date();
      const from = new Date(now.getTime() - 60*60*1000);

      const candles = await kc.getHistoricalData(
        instrument,
        from,
        now,
        "5minute"
      );

      if(!candles || candles.length < 20) continue;

      const closes = candles.map(c=>c.close);

      const rsi = calculateRSI(closes);
      const ema20 = ema(closes,20);
      const ema50 = ema(closes,50);
      const trend = ema20 > ema50 ? "UP" : "DOWN";

      const price = closes[closes.length-1];
      const prevPrice = closes[closes.length-2];

      const signal = getSmartSignal(rsi, trend, price, prevPrice);

      let existing = trades.find(t => t.symbol===symbol && t.status==="LIVE");

      if(!existing && signal==="BUY"){
        const qty = 1;

        const order = await kc.placeOrder("regular",{
          exchange:"NSE",
          tradingsymbol:symbol,
          transaction_type:"BUY",
          quantity:qty,
          product:"MIS",
          order_type:"MARKET"
        });

        trades.push({
          symbol,
          entry:price,
          sl:price*0.97,
          target:price*1.05,
          qty,
          status:"LIVE",
          rsi,
          trend,
          signal
        });
      }

      for(let t of trades){
        if(t.symbol===symbol && t.status==="LIVE"){

          if(price <= t.sl || price >= t.target){
            await kc.placeOrder("regular",{
              exchange:"NSE",
              tradingsymbol:symbol,
              transaction_type:"SELL",
              quantity:t.qty,
              product:"MIS",
              order_type:"MARKET"
            });

            let pnl = (price - t.entry) * t.qty;
            capital += pnl;

            t.status = price <= t.sl ? "SL_HIT" : "TARGET_HIT";
            t.exit = price;
            t.pnl = pnl;
          }

          if(price > t.entry*1.01){
            t.sl = price*0.997;
          }
        }
      }
    }

  }catch(e){
    console.log(e.message);
  }
}

setInterval(runBot,10000);

app.get("/performance",(req,res)=>{
  res.json({
    capital,
    trades,
    mode:"V102_SMART_SIGNAL"
  });
});

app.listen(PORT,()=>console.log("V102 SMART SIGNAL RUNNING"));
