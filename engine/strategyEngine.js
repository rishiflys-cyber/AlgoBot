const symbols = require("../nse200.json");

async function generateSignals(capital){
    if(capital < 5000) return [];

    return symbols.slice(0,5).map((s,i)=>({
        symbol: typeof s==="string"?s:(s.symbol||s.tradingsymbol),
        price: 100+i,
        score:5
    }));
}

module.exports = generateSignals;
module.exports.generateSignals = generateSignals;
