const strategy = require("./strategyEngine");

async function runLiveEngine(capital){
    const signals = await (strategy.generateSignals || strategy)(capital);

    const activeTrades = [];

    for(let s of signals){
        if(!s.symbol) continue;

        activeTrades.push({
            symbol: s.symbol,
            entry: s.price,
            qty: 1,
            status: "OPEN"
        });
    }

    return activeTrades;
}

module.exports = runLiveEngine;
module.exports.runLiveEngine = runLiveEngine;
