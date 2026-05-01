const KiteConnect = require("kiteconnect").KiteConnect;
const fs = require("fs");
const path = require("path");
const strategy = require("./strategyEngine");

const kc = new KiteConnect({ api_key: process.env.API_KEY });
const accessToken = fs.readFileSync(path.join(__dirname, "../access_token.txt"), "utf8").trim();
kc.setAccessToken(accessToken);

async function runLiveEngine(capital){
    const signals = await (strategy.generateSignals || strategy)(capital);
    const trades = [];

    for(let s of signals){
        try{
            const order = await kc.placeOrder("regular", {
                exchange: "NSE",
                tradingsymbol: s.symbol,
                transaction_type: "BUY",
                quantity: 1,
                product: "MIS",
                order_type: "MARKET"
            });

            trades.push({
                symbol: s.symbol,
                order_id: order.order_id,
                status: "PLACED"
            });

        }catch(e){
            trades.push({
                symbol: s.symbol,
                status: "FAILED"
            });
        }
    }

    return trades;
}

module.exports = runLiveEngine;
module.exports.runLiveEngine = runLiveEngine;
