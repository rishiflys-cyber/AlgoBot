const fs = require('fs');
const path = require('path');
const KiteConnect = require("kiteconnect").KiteConnect;

const kc = new KiteConnect({ api_key: process.env.API_KEY });

const accessToken = fs.readFileSync(path.join(__dirname, "../access_token.txt"), "utf8").trim();
kc.setAccessToken(accessToken);

const symbols = require("../nse200.json").slice(0, 40);

async function getHistorical(token) {
    try {
        const to = new Date();
        const from = new Date(to.getTime() - (60 * 60 * 1000));
        return await kc.getHistoricalData(token, from, to, "5minute");
    } catch {
        return [];
    }
}

function momentum(c) {
    return c[c.length-1].close > c[c.length-2].close &&
           c[c.length-2].close > c[c.length-3].close;
}

function breakout(c) {
    return c[c.length-1].close > c[c.length-2].high;
}

function bullish(x) {
    return x.close > x.open;
}

function volatile(c) {
    const x = c[c.length-1];
    return ((x.high - x.low) / x.close) > 0.003;
}

async function generateSignals(capital) {
    if (capital < 5000) return [];

    const results = [];

    for (let s of symbols) {
        try {
            const candles = await getHistorical(s.instrument_token);
            if (!candles || candles.length < 5) continue;

            const last = candles[candles.length - 1];

            if (breakout(candles) && bullish(last) && momentum(candles) && volatile(candles)) {
                results.push({
                    symbol: s.tradingsymbol,
                    price: last.close,
                    score: 10
                });
            }
        } catch (e) {}
    }

    return results.slice(0, 10);
}

module.exports = { generateSignals };
