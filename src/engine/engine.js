
const { KiteConnect } = require("kiteconnect");
const state = require("../core/state");

const kc = new KiteConnect({ api_key: process.env.API_KEY });

const symbols = {
  INFY: "NSE:INFY",
  RELIANCE: "NSE:RELIANCE",
  TCS: "NSE:TCS"
};

async function updateCapital(){
  try{
    kc.setAccessToken(process.env.ACCESS_TOKEN);
    const margins = await kc.getMargins();
    state.capital = margins.equity.available.cash || 0;
  }catch(e){
    console.log("CAPITAL ERROR", e.message);
  }
}

async function placeOrder(symbol, qty){
  try{
    kc.setAccessToken(process.env.ACCESS_TOKEN);

    const order = await kc.placeOrder("regular", {
      exchange: "NSE",
      tradingsymbol: symbol,
      transaction_type: "BUY",
      quantity: qty,
      product: "MIS",
      order_type: "MARKET"
    });

    return order;
  }catch(e){
    console.log("ORDER ERROR", e.message);
  }
}

setInterval(async ()=>{
  try{

    await updateCapital();

    for(let sym in symbols){

      kc.setAccessToken(process.env.ACCESS_TOKEN);

      let quote = await kc.getQuote([symbols[sym]]);
      let price = quote[symbols[sym]].last_price;

      let decision = true; // simplified trigger

      state.debug[sym] = {
        price,
        decision
      };

      if(decision && !state.trades.find(t=>t.symbol===sym)){

        let qty = Math.max(Math.floor(state.capital / price * 0.1),1);

        let order = await placeOrder(sym, qty);

        state.trades.push({
          symbol:sym,
          entry:price,
          qty,
          order_id: order?.order_id || "FAILED",
          status:"LIVE"
        });
      }
    }

  }catch(e){
    console.log("ENGINE ERROR", e.message);
  }

},15000);
