const KiteConnect = require("kiteconnect").KiteConnect;
const strategy = require("./strategyEngine");

const kc = new KiteConnect({ api_key: process.env.API_KEY });
kc.setAccessToken(process.env.ACCESS_TOKEN);

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
                order_type: "LIMIT",
                price: s.price
            });

            trades.push({
                symbol: s.symbol,
                order_id: order.order_id,
                price: s.price,
                status: "PLACED"
            });

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
