const strategy = require("./strategyEngine");

let activeTrades = [];

async function runLiveEngine(capital){
    const signals = await (strategy.generateSignals || strategy)(capital);

    // CLEAR OLD (simple reset each run)
    activeTrades = [];

    for(let s of signals){
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
