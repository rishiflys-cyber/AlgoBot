
const express = require("express");
const { KiteConnect } = require("kiteconnect");

const app = express();
const PORT = process.env.PORT || 3000;

const kc = new KiteConnect({ api_key: process.env.API_KEY });

const symbols = ["RELIANCE","INFY","TCS","HDFCBANK"];

let trades = [];
let capital = 8491.8;
let maxRiskPerTrade = 0.02; // 2%

// LOGIN
app.get("/login",(req,res)=>res.redirect(kc.getLoginURL()));

// REDIRECT
app.get("/redirect", async (req,res)=>{
  const session = await kc.generateSession(req.query.request_token, process.env.API_SECRET);
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  res.send("ACCESS_TOKEN: " + session.access_token + "<br>IP: " + ip);
});

// SIMPLE RSI
function rsi(prices){
  let gains=0, losses=0;
  for(let i=1;i<prices.length;i++){
    let d=prices[i]-prices[i-1];
    if(d>0) gains+=d; else losses-=d;
  }
  let rs=gains/(losses||1);
  return 100-(100/(1+rs));
}

// EMA
function ema(data,p){
  let k=2/(p+1), e=data[0];
  for(let i=1;i<data.length;i++) e=data[i]*k+e*(1-k);
  return e;
}

// BOT LOOP
async function runBot(){
  try{
    kc.setAccessToken(process.env.ACCESS_TOKEN);

    for(let symbol of symbols){

      const q = await kc.getQuote([`NSE:${symbol}`]);
      const price = q[`NSE:${symbol}`].last_price;

      let existing = trades.find(t => t.symbol===symbol && t.status==="LIVE");

      // MOCK DATA FOR INDICATORS (replace with real candles later)
      let prices = [price*0.99, price*1.01, price*1.02, price];

      let r = rsi(prices);
      let e20 = ema(prices,20);
      let e50 = ema(prices,50);

      let trend = e20 > e50 ? "UP":"DOWN";

      // POSITION SIZE
      let riskAmount = capital * maxRiskPerTrade;
      let qty = Math.max(1, Math.floor(riskAmount / (price*0.03)));

      // ENTRY
      if(!existing){
        if(r < 35 && trend==="UP"){
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
            order_id:order.order_id
          });
        }
      }

      // EXIT + TRAILING
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

          // TRAILING
          if(price > t.entry*1.02){
            t.sl = price*0.995;
          }
        }
      }
    }

  }catch(e){
    console.log(e.message);
  }
}

setInterval(runBot,10000);

// PERFORMANCE
app.get("/performance",(req,res)=>{
  res.json({
    capital,
    trades,
    risk_per_trade: maxRiskPerTrade,
    symbols,
    mode:"V100_INSTITUTION"
  });
});

app.get("/",(req,res)=>res.send("V100 INSTITUTION MODE RUNNING"));

app.listen(PORT,()=>console.log("V100 INSTITUTION RUNNING"));
