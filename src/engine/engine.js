
const { KiteConnect } = require("kiteconnect");
const state = require("../core/state");
const kc = new KiteConnect({ api_key: process.env.API_KEY });

const symbols = {
  INFY: 408065,
  RELIANCE: 738561,
  TCS: 2953217
};

const RISK = 0.02;
const MAX_TRADES = 3;

/* EMA */
function ema(data, p){
  let k=2/(p+1), val=data[0];
  for(let i=1;i<data.length;i++) val=data[i]*k+val*(1-k);
  return val;
}

/* RSI */
function rsi(c){
  let g=0,l=0;
  for(let i=1;i<c.length;i++){
    let d=c[i]-c[i-1];
    if(d>0) g+=d; else l-=d;
  }
  let rs=g/(l||1);
  return 100-(100/(1+rs));
}

/* AI */
function decision(m){
  let s=0;
  if(m.trend==="UP") s+=30;
  if(m.rsi<40) s+=30;
  if(m.momentum>0) s+=20;
  return {buy:s>=60,score:s};
}

/* QTY */
function qty(price, sl){
  let risk = state.capital * RISK;
  let dist = Math.abs(price-sl);
  return Math.max(Math.floor(risk/(dist||1)),1);
}

/* MARKET */
async function getMarket(inst){
  kc.setAccessToken(process.env.ACCESS_TOKEN);

  const now=new Date();
  const from=new Date(now.getTime()-60*60*1000);

  const candles = await kc.getHistoricalData(inst, from, now, "5minute");
  const closes = candles.map(c=>c.close);

  const price = closes.at(-1);

  return {
    price,
    rsi:rsi(closes),
    trend: ema(closes,20)>ema(closes,50)?"UP":"DOWN",
    momentum: price - closes.at(-2)
  };
}

/* LOOP */
setInterval(async ()=>{
  try{

    for(let sym in symbols){

      if(state.trades.length>=MAX_TRADES) break;

      let exists = state.trades.find(t=>t.symbol===sym);
      if(exists) continue;

      let m = await getMarket(symbols[sym]);
      let ai = decision(m);

      if(ai.buy){
        let sl = m.price*0.97;

        state.trades.push({
          symbol:sym,
          entry:m.price,
          sl,
          target:m.price*1.05,
          qty:qty(m.price,sl),
          status:"LIVE",
          score:ai.score
        });
      }
    }

    for(let t of state.trades){

      let m = await getMarket(symbols[t.symbol]);
      let price = m.price;
      let pnl = (price - t.entry)*t.qty;

      if(price>=t.target || price<=t.sl){
        t.status="CLOSED";
        t.exit=price;
        t.pnl=pnl;

        state.capital+=pnl;
        state.closedTrades.push(t);
      }
    }

    state.trades = state.trades.filter(t=>t.status==="LIVE");

  }catch(e){
    console.log("ERR",e.message);
  }

},10000);
