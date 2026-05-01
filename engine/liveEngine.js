const KiteConnect = require("kiteconnect").KiteConnect;
const strategy = require("./strategyEngine");

const kc = new KiteConnect({ api_key: process.env.API_KEY });
kc.setAccessToken(process.env.ACCESS_TOKEN);

async function runLiveEngine(capital){
    const signals = await (strategy.generateSignals || strategy)(capital);
    const trades = [];

    for(let s of signals){
        try{
            const price = s.price;
            const sl = parseFloat((price * 0.98).toFixed(2));
            const target = parseFloat((price * 1.02).toFixed(2));

            const buy = await kc.placeOrder("regular", {
                exchange: "NSE",
                tradingsymbol: s.symbol,
                transaction_type: "BUY",
                quantity: 1,
                product: "MIS",
                order_type: "LIMIT",
                price: price
            });

            const slOrder = await kc.placeOrder("regular", {
                exchange: "NSE",
                tradingsymbol: s.symbol,
                transaction_type: "SELL",
                quantity: 1,
                product: "MIS",
                order_type: "SL-M",
                trigger_price: sl
            });

            const targetOrder = await kc.placeOrder("regular", {
                exchange: "NSE",
                tradingsymbol: s.symbol,
                transaction_type: "SELL",
                quantity: 1,
                product: "MIS",
                order_type: "LIMIT",
                price: target
            });

            trades.push({
                symbol: s.symbol,
                entry: price,
                sl: sl,
                target: target,
                buy_order: buy.order_id,
                sl_order: slOrder.order_id,
                target_order: targetOrder.order_id,
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
