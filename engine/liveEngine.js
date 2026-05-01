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

            // BUY ORDER (MIS)
            const buy = await kc.placeOrder("regular", {
                exchange: "NSE",
                tradingsymbol: s.symbol,
                transaction_type: "BUY",
                quantity: 1,
                product: "MIS",
                order_type: "LIMIT",
                price: price
            });

            // STOP LOSS (SL-M)
            const sl = await kc.placeOrder("regular", {
                exchange: "NSE",
                tradingsymbol: s.symbol,
                transaction_type: "SELL",
                quantity: 1,
                product: "MIS",
                order_type: "SL-M",
                trigger_price: parseFloat((price * 0.98).toFixed(2))
            });

            // TARGET (LIMIT SELL)
            const target = await kc.placeOrder("regular", {
                exchange: "NSE",
                tradingsymbol: s.symbol,
                transaction_type: "SELL",
                quantity: 1,
                product: "MIS",
                order_type: "LIMIT",
                price: parseFloat((price * 1.02).toFixed(2))
            });

            trades.push({
                symbol: s.symbol,
                entry: price,
                sl: price * 0.98,
                target: price * 1.02,
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
