const strategy = require("./strategyEngine");

async function runLiveEngine(capital){
    const fn = strategy.generateSignals || strategy;
    return await fn(capital);
}

module.exports = runLiveEngine;
module.exports.runLiveEngine = runLiveEngine;
