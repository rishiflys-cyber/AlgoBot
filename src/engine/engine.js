
const { KiteConnect } = require("kiteconnect");
const state = require("../core/state");
const kc = new KiteConnect({ api_key: process.env.API_KEY });

const symbols = {
  INFY: "NSE:INFY",
  RELIANCE: "NSE:RELIANCE",
  TCS: "NSE:TCS"
};

const RISK = 0.02;

/* SIMPLE RSI */
function rsi(prices){
  let gains=0, losses=0;
  for(let i=1;i<prices.length;i++){
    let d=prices[i]-prices[i-1];
    if(d>0) gains+=d; else losses-=d;
  }
  let rs=gains/(losses||1);
  return 100-(100/(1+rs));
}

/* EMA */
function ema(data,p){
  let k=2/(p+1), val=data[0];
  for(let i=1;i<data.length;i++) val=data[i]*k+val*(1-k);
  return val;
}

async function updateCapital(){
  try{
    kc.setAccessToken(process.env.ACCESS_TOKEN);
    const margins = await kc.getMargins();
    state.capital = margins.equity.available.cash || 0;
  }catch(e){
    console.log("Capital fetch fail");
  }
}

function decision(m){
  let score=0;
  if(m.trend==="UP") score+=30;
  if(m.rsi<50) score+=30;
  if(m.momentum>0) score+=20;
  return {buy:score>=50,score};
}

setInterval(async ()=>{
  try{

    await updateCapital();

    for(let sym in symbols){

      kc.setAccessToken(process.env.ACCESS_TOKEN);

      let quote = await kc.getQuote([symbols[sym]]);
      let price = quote[symbols[sym]].last_price;

      let fakeHistory = [price-2, price-1, price]; // lightweight
      let r = rsi(fakeHistory);
      let e20 = ema(fakeHistory,2);
      let e50 = ema(fakeHistory,3);

      let m = {
        price,
        rsi:r,
        trend: e20>e50?"UP":"DOWN",
        momentum: price - fakeHistory[1]
      };

      let ai = decision(m);

      state.debug[sym] = {
        price: m.price,
        rsi: m.rsi,
        trend: m.trend,
        momentum: m.momentum,
        score: ai.score,
        action: ai.buy ? "BUY":"HOLD"
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
    console.log("ERR", e.message);
  }

},10000);
