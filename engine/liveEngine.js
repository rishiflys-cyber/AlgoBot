const KiteConnect = require("kiteconnect").KiteConnect;
const strategy = require("./strategyEngine");

const kc = new KiteConnect({ api_key: process.env.API_KEY });

const accessToken = process.env.ACCESS_TOKEN;
if(accessToken) kc.setAccessToken(accessToken);

async function runLiveEngine(capital){
    const signals = await (strategy.generateSignals || strategy)(capital);
    const trades = [];

    for(let s of signals){
        try{
            const symbol = (s.symbol || "").replace("NSE:", "");

            const order = await kc.placeOrder("regular", {
                exchange: "NSE",
                tradingsymbol: symbol,
                transaction_type: "BUY",
                quantity: 1,
                product: "MIS",
                order_type: "MARKET"
            });

            trades.push({symbol, order_id: order.order_id, status:"PLACED"});

        }catch(e){
            trades.push({symbol:s.symbol, status:"FAILED", reason:e.message});
        }
    }

    return trades;
}

module.exports = runLiveEngine;
