const KiteConnect = require("kiteconnect").KiteConnect;
const strategy = require("./strategyEngine");

const kc = new KiteConnect({ api_key: process.env.API_KEY });
kc.setAccessToken(process.env.ACCESS_TOKEN);

let positions = [];

async function runLiveEngine(capital){
    const signals = await (strategy.generateSignals || strategy)(capital);
    const trades = [];

    for(let s of signals){
        try{
            const order = await kc.placeOrder("amo", {
                exchange: "NSE",
                tradingsymbol: s.symbol,
                transaction_type: "BUY",
                quantity: 1,
                product: "CNC",
                order_type: "MARKET"
            });

            const trade = {
                symbol: s.symbol,
                entry: s.price,
                qty: 1,
                stoploss: s.price * 0.98,
                target: s.price * 1.02,
                order_id: order.order_id,
                status: "OPEN"
            };

            positions.push(trade);
            trades.push(trade);

        }catch(e){
            trades.push({
                symbol: s.symbol,
                status: "FAILED",
                reason: e.message
            });
        }
    }

    return trades;
}

module.exports = runLiveEngine;
