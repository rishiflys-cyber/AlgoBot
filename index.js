const express = require("express");
const { KiteConnect } = require("kiteconnect");

const app = express();
const PORT = process.env.PORT || 3000;

const kc = new KiteConnect({ api_key: process.env.API_KEY });

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

app.get("/performance", async (req,res)=>{
  try{
    kc.setAccessToken(process.env.ACCESS_TOKEN);

    const instrument = 256265;

    const now = new Date();
    const from = new Date(now.getTime() - 2*60*60*1000);

    const candles = await kc.getHistoricalData(
      instrument,
      from.toISOString(),
      now.toISOString(),
      "5minute"
    );

    if(!candles || candles.length === 0){
      return res.json({status:"NO_DATA", mode:"V95_FIX"});
    }

    const closes = candles.map(c=>c.close);

    let gains=0, losses=0;
    for(let i=1;i<closes.length;i++){
      let diff = closes[i]-closes[i-1];
      if(diff>0) gains+=diff;
      else losses-=diff;
    }

    let rs = gains/(losses||1);
    let rsi = 100 - (100/(1+rs));

    res.json({
      capital:8491.8,
      rsi:rsi,
      candles:closes.length,
      status:"RUNNING",
      mode:"V95_FIX"
    });

  }catch(e){
    res.json({error:e.message, fix:"handled crash"});
  }
});

app.listen(PORT,()=>console.log("V95 FIX RUNNING"));
