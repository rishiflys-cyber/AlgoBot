
const ai = require("./strategies/smartAI");
const options = require("./strategies/dynamicOptions");

exports.run = async function(kc, capital){

  const now = new Date().toLocaleString("en-US",{timeZone:"Asia/Kolkata"});
  const d = new Date(now);
  const t = d.getHours()*60 + d.getMinutes();

  if(t < 555 || t > 925){
    return { status:"MARKET_CLOSED", mode:"V83_SMART_AI" };
  }

  const signals = [
    ...(await ai.generate(kc)),
    ...(await options.generate(kc))
  ];

  return { status:"RUNNING", trades:signals, mode:"V83_SMART_AI" };
};
