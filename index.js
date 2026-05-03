
const express = require("express");
const { KiteConnect } = require("kiteconnect");

const app = express();
const PORT = process.env.PORT || 3000;

const kc = new KiteConnect({ api_key: process.env.API_KEY });

// LOGIN
app.get("/login",(req,res)=>res.redirect(kc.getLoginURL()));

app.get("/redirect", async (req,res)=>{
  try{
    const session = await kc.generateSession(req.query.request_token, process.env.API_SECRET);
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    res.send("ACCESS_TOKEN: "+session.access_token+"<br>IP: "+ip);
  }catch(e){
    res.send(e.message);
  }
});

// PERFORMANCE
app.get("/performance", async (req,res)=>{
  try{
    kc.setAccessToken(process.env.ACCESS_TOKEN);

    const instrument = 256265; // NIFTY

    const now = new Date();
    const from = new Date(now.getTime() - 3*60*60*1000);

    // FIX: pass Date objects directly (NOT ISO string)
    const candles = await kc.getHistoricalData(
      instrument,
      from,
      now,
      "5minute"
    );

    if(!candles || candles.length < 10){
      return res.json({status:"NO_DATA", mode:"V95_FULL"});
    }

    const closes = candles.map(c=>c.close);

    // RSI
    let gains=0, losses=0;
    for(let i=1;i<closes.length;i++){
      let diff = closes[i]-closes[i-1];
      if(diff>0) gains+=diff;
      else losses-=diff;
    }
    let rs = gains/(losses||1);
    let rsi = 100 - (100/(1+rs));

    // EMA
    function ema(data, period){
      let k = 2/(period+1);
      let e = data[0];
      for(let i=1;i<data.length;i++){
        e = data[i]*k + e*(1-k);
      }
      return e;
    }

    let ema20 = ema(closes,20);
    let ema50 = ema(closes,50);

    let trend = ema20 > ema50 ? "BULLISH":"BEARISH";

    // SIMPLE EXECUTION LOGIC (SAFE)
    let signal = "NO_TRADE";

    if(rsi < 35 && trend==="BULLISH"){
      signal = "BUY_CALL";
    } else if(rsi > 65 && trend==="BEARISH"){
      signal = "BUY_PUT";
    }

    res.json({
      capital:8491.8,
      rsi:rsi,
      ema20:ema20,
      ema50:ema50,
      trend:trend,
      signal:signal,
      candles:closes.length,
      status:"STABLE_RUNNING",
      mode:"V95_FULL"
    });

  }catch(e){
    res.json({error:e.message});
  }
});

app.listen(PORT,()=>console.log("V95 FULL RUNNING"));
