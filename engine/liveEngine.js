const KiteConnect = require("kiteconnect").KiteConnect;
const strategy = require("./strategyEngine");

const kc = new KiteConnect({ api_key: process.env.API_KEY });
kc.setAccessToken(process.env.ACCESS_TOKEN);

function isMarketOpenStrict(){
    const now = new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" });
    const d = new Date(now);

    const day = d.getDay();
    const t = d.getHours()*60 + d.getMinutes();

    if(day === 0 || day === 6) return false;

    return t >= 555 && t <= 925;
}

async function runLiveEngine(capital){

    if(!isMarketOpenStrict()){
        return [{status:"MARKET_CLOSED_NO_EXECUTION"}];
    }

    const signals = await strategy.generateSignals(kc);
    const trades = [];

    for(let s of signals){
        try{
            const order = await kc.placeOrder("regular", {
                exchange: "NSE",
                tradingsymbol: s.symbol,
                transaction_type: "BUY",
                quantity: 1,
                product: "MIS",
                order_type: "LIMIT",
                price: s.price
            });

            trades.push({
                symbol:s.symbol,
                order_id:order.order_id,
                status:"PLACED"
            });

        }catch(e){
            trades.push({symbol:s.symbol,status:"FAILED",reason:e.message});
        }
    }

    return trades;
}

module.exports = runLiveEngine;
