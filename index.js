
const express = require("express");
const { KiteConnect } = require("kiteconnect");

const app = express();
const PORT = process.env.PORT || 3000;

const kc = new KiteConnect({ api_key: process.env.API_KEY });

// IST FORMAT
function formatIST(date){
  const offset = 5.5 * 60 * 60 * 1000;
  const ist = new Date(date.getTime() + offset);
  const pad = n => n<10 ? "0"+n : n;

  return ist.getUTCFullYear() + "-" +
    pad(ist.getUTCMonth()+1) + "-" +
    pad(ist.getUTCDate()) + " " +
    pad(ist.getUTCHours()) + ":" +
    pad(ist.getUTCMinutes()) + ":00";
}

app.get("/performance", async (req,res)=>{
  try{
    kc.setAccessToken(process.env.ACCESS_TOKEN);

    const instrument = 256265;

    // FORCE VALID MARKET WINDOW
    const now = new Date();
    now.setHours(15,0,0,0);

    const from = new Date(now);
    from.setHours(10,0,0,0);

    const fromStr = formatIST(from);
    const toStr = formatIST(now);

    const candles = await kc.getHistoricalData(
      instrument,
      fromStr,
      toStr,
      "5minute"
    );

    if(!candles || candles.length===0){
      return res.json({
        status:"NO_DATA",
        from:fromStr,
        to:toStr
      });
    }

    const closes = candles.map(c=>c.close);

    res.json({
      capital:8491.8,
      candles:closes.length,
      from:fromStr,
      to:toStr,
      status:"WORKING_FINAL"
    });

  }catch(e){
    res.json({error:e.message});
  }
});

app.listen(PORT,()=>console.log("V95 REAL FINAL RUNNING"));
