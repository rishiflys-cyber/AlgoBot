const KiteConnect = require("kiteconnect").KiteConnect;
const strategy = require("./strategyEngine");

const kc = new KiteConnect({ api_key: process.env.API_KEY });
kc.setAccessToken(process.env.ACCESS_TOKEN);

function isMarketOpen(){
    const now = new Date();
    const time = now.getHours()*60 + now.getMinutes();
    return time >= 555 && time <= 925;
}

async function runLiveEngine(capital){
    if(!isMarketOpen()){
        return [{status:"MARKET_CLOSED"}];
    }

    const signals = await strategy.generateSignals(kc);
    const trades = [];

    for(let s of signals){
        try{
            const buy = await kc.placeOrder("regular", {
                exchange: "NSE",
                tradingsymbol: s.symbol,
                transaction_type: "BUY",
                quantity: 1,
                product: "MIS",
                order_type: "LIMIT",
                price: s.price
            });

            trades.push({
                symbol: s.symbol,
                price: s.price,
                order_id: buy.order_id,
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
