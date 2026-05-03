
const express = require("express");
const fs = require("fs");
const { KiteConnect } = require("kiteconnect");

const app = express();
const PORT = process.env.PORT || 3000;

const kc = new KiteConnect({ api_key: process.env.API_KEY });

let trades = [];

// LOGIN
app.get("/login",(req,res)=>res.redirect(kc.getLoginURL()));

// REDIRECT
app.get("/redirect", async (req,res)=>{
  const session = await kc.generateSession(req.query.request_token, process.env.API_SECRET);
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  res.send("ACCESS_TOKEN: " + session.access_token + "<br>IP: " + ip);
});

// AUTO LOOP ENGINE
async function runBot(){
  try{
    kc.setAccessToken(process.env.ACCESS_TOKEN);

    const symbol = "RELIANCE";
    const q = await kc.getQuote([`NSE:${symbol}`]);
    const price = q[`NSE:${symbol}`].last_price;

    // ENTRY CONDITION (simple)
    if(trades.length === 0){

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
        order_id:order.order_id,
        status:"LIVE"
      });
    }

    // MONITOR + EXIT
    for(let t of trades){
      if(t.status==="LIVE"){

        if(price <= t.sl || price >= t.target){

          await kc.placeOrder("regular",{
            exchange:"NSE",
            tradingsymbol:t.symbol,
            transaction_type:"SELL",
            quantity:1,
            product:"MIS",
            order_type:"MARKET"
          });

          t.status = price <= t.sl ? "SL_HIT" : "TARGET_HIT";
        }

        // TRAILING SL
        if(price > t.entry*1.02){
          t.sl = price*0.995;
        }
      }
    }

  }catch(e){
    console.log(e.message);
  }
}

// LOOP EVERY 10 SECONDS
setInterval(runBot,10000);

// PERFORMANCE
app.get("/performance",(req,res)=>{
  res.json({
    capital:8491.8,
    trades,
    mode:"V98_FULL_AUTO"
  });
});

app.get("/",(req,res)=>res.send("V98 AUTO RUNNING"));

app.listen(PORT,()=>console.log("V98 FULL AUTO RUNNING"));
