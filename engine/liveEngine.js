const strategy = require("./strategyEngine");

async function run(capital) {
    const fn = strategy.generateSignals || strategy;
    const signals = await fn(capital);
    return signals;
}

module.exports = { run };
