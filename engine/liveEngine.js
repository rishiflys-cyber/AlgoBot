const strategy = require("./strategyEngine");

async function runLiveEngine(capital){
    return await (strategy.generateSignals || strategy)(capital);
}

module.exports = runLiveEngine;
module.exports.runLiveEngine = runLiveEngine;
