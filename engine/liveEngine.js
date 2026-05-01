const KiteConnect = require("kiteconnect").KiteConnect;
const fs = require("fs");
const strategy = require("./strategyEngine");

const kc = new KiteConnect({ api_key: process.env.API_KEY });
const accessToken = fs.existsSync("access_token.txt") ? fs.readFileSync("access_token.txt","utf8").trim() : null;

if(accessToken) kc.setAccessToken(accessToken);

async function runLiveEngine(capital){
    const signals = await (strategy.generateSignals || strategy)(capital);
    const trades = [];

    for(let s of signals){
        try{
            const cleanSymbol = (s.symbol || "").replace("NSE:", "");

            const order = await kc.placeOrder("regular", {
                exchange: "NSE",
                tradingsymbol: cleanSymbol,
                transaction_type: "BUY",
                quantity: 1,
                product: "MIS",
                order_type: "MARKET"
            });

            trades.push({
                symbol: cleanSymbol,
                order_id: order.order_id,
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
