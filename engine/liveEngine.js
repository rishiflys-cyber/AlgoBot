const KiteConnect = require("kiteconnect").KiteConnect;
const strategy = require("./strategyEngine");

const kc = new KiteConnect({ api_key: process.env.API_KEY });
kc.setAccessToken(process.env.ACCESS_TOKEN);

// CONFIG
const MAX_RISK_PER_TRADE = 0.01; // 1%
const MAX_DAILY_TRADES = 3;

function isMarketOpen(){
    const now = new Date();
    const t = now.getHours()*60 + now.getMinutes();
    return t >= 555 && t <= 925;
}

async function runLiveEngine(capital){
    if(!isMarketOpen()) return [{status:"MARKET_CLOSED"}];

    const signals = await strategy.generateSignals(kc);
    let trades = [];

    let tradeCount = 0;

    for(let s of signals){

        if(tradeCount >= MAX_DAILY_TRADES) break;

        try{
            const entry = s.price;
            const sl = parseFloat((entry * 0.98).toFixed(2));
            const target = parseFloat((entry * 1.02).toFixed(2));

            // POSITION SIZE
            const riskPerShare = entry - sl;
            const riskCapital = capital * MAX_RISK_PER_TRADE;
            let qty = Math.floor(riskCapital / riskPerShare);

            if(qty < 1) qty = 1;

            const buy = await kc.placeOrder("regular", {
                exchange: "NSE",
                tradingsymbol: s.symbol,
                transaction_type: "BUY",
                quantity: qty,
                product: "MIS",
                order_type: "LIMIT",
                price: entry
            });

            await kc.placeOrder("regular", {
                exchange: "NSE",
                tradingsymbol: s.symbol,
                transaction_type: "SELL",
                quantity: qty,
                product: "MIS",
                order_type: "SL-M",
                trigger_price: sl
            });

            await kc.placeOrder("regular", {
                exchange: "NSE",
                tradingsymbol: s.symbol,
                transaction_type: "SELL",
                quantity: qty,
                product: "MIS",
                order_type: "LIMIT",
                price: target
            });

            trades.push({
                symbol: s.symbol,
                qty,
                entry,
                sl,
                target,
                status:"PLACED"
            });

            tradeCount++;

        }catch(e){
            trades.push({
                symbol: s.symbol,
                status:"FAILED",
                reason:e.message
            });
        }
    }

    return trades;
}

module.exports = runLiveEngine;
