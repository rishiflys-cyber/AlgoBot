const KiteConnect = require("kiteconnect").KiteConnect;
const strategy = require("./strategyEngine");

const kc = new KiteConnect({ api_key: process.env.API_KEY });
kc.setAccessToken(process.env.ACCESS_TOKEN);

// IST TIME CHECK
function isMarketOpen(){
    const now = new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" });
    const d = new Date(now);
    const t = d.getHours()*60 + d.getMinutes();
    return t >= 555 && t <= 925;
}

async function runLiveEngine(capital){

    if(!isMarketOpen()) return [{status:"MARKET_CLOSED_IST"}];

    const signals = await strategy.generateSignals(kc);
    const trades = [];

    for(let s of signals){
        try{
            const entry = s.price;
            const sl = entry * 0.98;
            const target = entry * 1.02;

            const qty = Math.max(1, Math.floor((capital*0.01)/(entry-sl)));

            const order = await kc.placeOrder("regular", {
                exchange: "NSE",
                tradingsymbol: s.symbol,
                transaction_type: "BUY",
                quantity: qty,
                product: "MIS",
                order_type: "LIMIT",
                price: entry
            });

            trades.push({
                symbol:s.symbol,
                qty,
                entry,
                sl,
                target,
                score:s.score,
                status:"PLACED"
            });

        }catch(e){
            trades.push({symbol:s.symbol,status:"FAILED",reason:e.message});
        }
    }

    return trades;
}

module.exports = runLiveEngine;
