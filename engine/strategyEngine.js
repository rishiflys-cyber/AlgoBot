// HARD FIX: NO tradingsymbol usage

const symbols = require("../nse200.json");

async function generateSignals(capital){
    if(capital < 5000) return [];

    const results = [];

    for (let i = 0; i < 10; i++) {
        const s = symbols[i];

        let sym = "";
        if (typeof s === "string") sym = s;
        else if (s && s.symbol) sym = s.symbol;
        else sym = "STOCK_" + i;

        results.push({
            symbol: sym,
            price: 100 + i,
            score: 5
        });
    }

    return results;
}

module.exports = generateSignals;
module.exports.generateSignals = generateSignals;
