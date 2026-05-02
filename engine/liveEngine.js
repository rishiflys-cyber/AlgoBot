exports.run = async function(kc, capital){

  const now = new Date().toLocaleString("en-US",{timeZone:"Asia/Kolkata"});
  const d = new Date(now);
  const t = d.getHours()*60 + d.getMinutes();

  // FIXED RESPONSE FORMAT
  if(t < 555 || t > 925){
    return { status:"MARKET_CLOSED", mode:"FULL_AUTO" };
  }

  return { status:"READY", mode:"FULL_AUTO" };
};
