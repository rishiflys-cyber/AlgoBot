
const fs = require("fs");

const STOCKS = ["TCS","INFY","RELIANCE","HDFCBANK"];

exports.run = async function(kc, capital){

  const positions = await kc.getPositions();
  let pnl=0;
  positions.net.forEach(p=> pnl+=p.pnl);

  let trades=[];
  try{ trades=JSON.parse(fs.readFileSync("./data/trades.json")); }catch{}

  // EXIT
  for(let t of trades){
    if(t.status==="LIVE"){
      let q = await kc.getQuote([`NSE:${t.symbol}`]);
      let price = q[`NSE:${t.symbol}`].last_price;

      if(price <= t.sl || price >= t.target){
        await kc.placeOrder("regular",{
          exchange:"NSE",
          tradingsymbol:t.symbol,
          transaction_type:"SELL",
          quantity:t.qty,
          product:"MIS",
          order_type:"MARKET"
        });

        t.status = price <= t.sl ? "SL_EXIT":"TARGET_EXIT";
      }
    }
  }

  // ENTRY (AGGRESSIVE MULTI STOCK)
  for(let s of STOCKS){

    try{
      let q = await kc.getQuote([`NSE:${s}`]);
      let price = q[`NSE:${s}`].last_price;

      if(price % 3 === 0){ // aggressive trigger

        let sl = price*0.97;
        let target = price*1.04;
        let qty = 1;

        await kc.placeOrder("regular",{
          exchange:"NSE",
          tradingsymbol:s,
          transaction_type:"BUY",
          quantity:qty,
          product:"MIS",
          order_type:"MARKET"
        });

        trades.push({
          symbol:s,
          entry:price,
          sl:sl,
          target:target,
          qty:qty,
          status:"LIVE"
        });
      }

    }catch(e){}
  }

  fs.writeFileSync("./data/trades.json",JSON.stringify(trades,null,2));

  return {status:"AGGRESSIVE_RUNNING", pnl, trades, mode:"V89_AGGRESSIVE"};
};
