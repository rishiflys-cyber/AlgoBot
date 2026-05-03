
const { KiteConnect } = require("kiteconnect");
const state = require("../core/state");
const kc = new KiteConnect({ api_key: process.env.API_KEY });

const symbols = {
  INFY: "NSE:INFY",
  RELIANCE: "NSE:RELIANCE",
  TCS: "NSE:TCS"
};

function decision(m){
  let reasons = [];
  let score=0;

  if(m.trend==="UP"){
    score+=30;
  } else {
    reasons.push("Trend not UP");
  }

  if(m.rsi<50){
    score+=30;
  } else {
    reasons.push("RSI too high");
  }

  if(m.momentum>0){
    score+=20;
  } else {
    reasons.push("No momentum");
  }

  let buy = score>=50;

  if(!buy && reasons.length===0){
    reasons.push("Score below threshold");
  }

  return {buy,score,reasons};
}

async function updateCapital(){
  try{
    kc.setAccessToken(process.env.ACCESS_TOKEN);
    const margins = await kc.getMargins();
    state.capital = margins.equity.available.cash || 0;
  }catch(e){}
}

setInterval(async ()=>{
  try{

    await updateCapital();

    for(let sym in symbols){

      kc.setAccessToken(process.env.ACCESS_TOKEN);

      let quote = await kc.getQuote([symbols[sym]]);
      let price = quote[symbols[sym]].last_price;

      let rsi = 60; // simple stable placeholder
      let trend = "UP";
      let momentum = 1;

      let m = {price,rsi,trend,momentum};

      let ai = decision(m);

      state.debug[sym] = {
        price,
        rsi,
        trend,
        momentum,
        score: ai.score,
        action: ai.buy ? "BUY":"HOLD",
        reason: ai.buy ? "All conditions met" : ai.reasons.join(", ")
      };

      if(ai.buy && !state.trades.find(t=>t.symbol===sym)){
        state.trades.push({
          symbol:sym,
          entry:price,
          status:"LIVE",
          score:ai.score
        });
      }
    }

  }catch(e){
    console.log("ERR",e.message);
  }

},10000);
