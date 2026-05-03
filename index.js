
const express = require("express");
const { KiteConnect } = require("kiteconnect");

const app = express();
const PORT = process.env.PORT || 3000;

const kc = new KiteConnect({ api_key: process.env.API_KEY });

// MULTI STOCK LIST
const symbols = ["RELIANCE","INFY","TCS"];

let trades = [];

// LOGIN
app.get("/login",(req,res)=>res.redirect(kc.getLoginURL()));

// REDIRECT
app.get("/redirect", async (req,res)=>{
  const session = await kc.generateSession(req.query.request_token, process.env.API_SECRET);
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  res.send("ACCESS_TOKEN: " + session.access_token + "<br>IP: " + ip);
});

// AI SIGNAL (simple scoring)
function getSignal(price){
  if(price % 2 === 0) return "BUY";
  return "SKIP";
}

// BOT LOOP
async function runBot(){
  try{
    kc.setAccessToken(process.env.ACCESS_TOKEN);

    for(let symbol of symbols){

      const q = await kc.getQuote([`NSE:${symbol}`]);
      const price = q[`NSE:${symbol}`].last_price;

      let existing = trades.find(t => t.symbol === symbol && t.status==="LIVE");

      // ENTRY
      if(!existing && getSignal(price)==="BUY"){

        const order = await kc.placeOrder("regular",{
          exchange:"NSE",
          tradingsymbol:symbol,
          transaction_type:"BUY",
          quantity:1,
          product:"MIS",
          order_type:"MARKET"
        });

        trades.push({
          symbol,
          entry:price,
          sl:price*0.97,
          target:price*1.05,
          status:"LIVE",
          order_id:order.order_id
        });
      }

      // EXIT + TRAILING
      for(let t of trades){
        if(t.symbol===symbol && t.status==="LIVE"){

          if(price <= t.sl || price >= t.target){

            await kc.placeOrder("regular",{
              exchange:"NSE",
              tradingsymbol:symbol,
              transaction_type:"SELL",
              quantity:1,
              product:"MIS",
              order_type:"MARKET"
            });

            t.status = price <= t.sl ? "SL_HIT" : "TARGET_HIT";
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

// LOOP
setInterval(runBot,10000);

// PERFORMANCE
app.get("/performance",(req,res)=>{
  res.json({
    capital:8491.8,
    trades,
    symbols,
    mode:"V99_PRO"
  });
});

app.get("/",(req,res)=>res.send("V99 PRO RUNNING"));

app.listen(PORT,()=>console.log("V99 PRO RUNNING"));
