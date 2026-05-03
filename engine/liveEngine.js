
const ai = require("./strategies/aiStrategy");
const options = require("./strategies/optionsStrategy");

exports.run = async function(kc, capital){

  const now = new Date().toLocaleString("en-US",{timeZone:"Asia/Kolkata"});
  const d = new Date(now);
  const t = d.getHours()*60 + d.getMinutes();

  if(t < 555 || t > 925){
    return { status:"MARKET_CLOSED", mode:"V82_AI_OPTIONS" };
  }

  const positions = await kc.getPositions();
  let pnl = 0;
  positions.net.forEach(p=>pnl+=p.pnl);

  if(pnl <= -capital*0.03){
    return { status:"AUTO_SHUTDOWN", pnl, mode:"V82_AI_OPTIONS" };
  }

  const signals = [
    ...(await ai.generate(kc)),
    ...(await options.generate(kc))
  ];

  const results=[];

  for(let s of signals){

    if(positions.net.length > 0) continue;

    try{
      let order = await kc.placeOrder("regular",{
        exchange:s.exchange,
        tradingsymbol:s.symbol,
        transaction_type:"BUY",
        quantity:1,
        product:"MIS",
        order_type:"MARKET"
      });

      results.push({
        symbol:s.symbol,
        type:s.type,
        order_id:order.order_id,
        status:"PLACED"
      });

    }catch(e){
      results.push({symbol:s.symbol,status:"FAILED",reason:e.message});
    }
  }

  return {status:"RUNNING", pnl, trades:results, mode:"V82_AI_OPTIONS"};
};
