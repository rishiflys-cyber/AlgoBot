const fs = require('fs');
const path = require('path');
const KiteConnect = require("kiteconnect").KiteConnect;

const kc = new KiteConnect({ api_key: process.env.API_KEY });
const accessToken = fs.readFileSync(path.join(__dirname, "../access_token.txt"), "utf8").trim();
kc.setAccessToken(accessToken);

const symbols = require("../nse200.json");

async function getQuotes() {
    try {
        const list = symbols.slice(0,50).map(s => "NSE:" + s.tradingsymbol);
        return await kc.getQuote(list);
    } catch {
        return {};
    }
}

async function generateSignals(capital){
    if(capital < 5000) return [];

    const quotes = await getQuotes();
    const results = [];

    for (let key in quotes){
        const q = quotes[key];
        if(q && q.last_price && q.ohlc){
            if(q.last_price > q.ohlc.open){
                results.push({
                    symbol: key.replace("NSE:",""),
                    price: q.last_price,
                    score: 5
                });
            }
        }
    }

    return results.slice(0,10);
}

module.exports = generateSignals;
module.exports.generateSignals = generateSignals;
