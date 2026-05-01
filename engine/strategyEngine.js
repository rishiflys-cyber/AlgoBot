// SAFE FIX: handle symbol structure properly

const symbols = require("../nse200.json");

async function generateSignals(capital){
    if(capital < 5000) return [];

    const results = [];

    for (let i = 0; i < 10; i++) {
        const s = symbols[i];

        const sym = s.tradingsymbol || s.symbol || s;

        if(!sym) continue;

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
