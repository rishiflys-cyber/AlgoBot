const KiteConnect = require("kiteconnect").KiteConnect;
const fs = require("fs");
const path = require("path");
const strategy = require("./strategyEngine");

const kc = new KiteConnect({ api_key: process.env.API_KEY });
const accessToken = fs.readFileSync(path.join(__dirname, "../access_token.txt"), "utf8").trim();
kc.setAccessToken(accessToken);

const MAX_TRADES = 2;
const RISK_PER_TRADE = 0.1; // 10% capital

async function runLiveEngine(capital){
    const signals = await (strategy.generateSignals || strategy)(capital);
    const trades = [];

    let usedCapital = 0;
    let count = 0;

    for(let s of signals){
        if(count >= MAX_TRADES) break;

        try{
            const cleanSymbol = (s.symbol || "").replace("NSE:", "");
            const qty = 1;

            if(usedCapital + (s.price * qty) > capital * RISK_PER_TRADE) continue;

            const order = await kc.placeOrder("regular", {
                exchange: "NSE",
                tradingsymbol: cleanSymbol,
                transaction_type: "BUY",
                quantity: qty,
                product: "MIS",
                order_type: "MARKET"
            });

            usedCapital += s.price * qty;
            count++;

            trades.push({
                symbol: cleanSymbol,
                order_id: order.order_id,
                qty: qty,
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
module.exports.runLiveEngine = runLiveEngine;
