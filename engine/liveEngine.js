const KiteConnect = require("kiteconnect").KiteConnect;
const breakout = require("./strategies/breakout");
const momentum = require("./strategies/momentum");

const kc = new KiteConnect({ api_key: process.env.API_KEY });
kc.setAccessToken(process.env.ACCESS_TOKEN);

function isMarketOpen(){
    const now = new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" });
    const d = new Date(now);
    const t = d.getHours()*60 + d.getMinutes();
    const day = d.getDay();
    return !(day === 0 || day === 6) && t >= 555 && t <= 925;
}

async function runEngine(totalCapital){

    if(!isMarketOpen()){
        return [{status:"MARKET_CLOSED_NO_EXECUTION"}];
    }

    // CAPITAL SPLIT
    const capitalA = totalCapital * 0.5;
    const capitalB = totalCapital * 0.5;

    const signalsA = await breakout.generate(kc);
    const signalsB = await momentum.generate(kc);

    const trades = [];

    // STRATEGY A
    for(let s of signalsA){
        try{
            const qty = Math.max(1, Math.floor(capitalA / s.price));

            const order = await kc.placeOrder("regular", {
                exchange: "NSE",
                tradingsymbol: s.symbol,
                transaction_type: "BUY",
                quantity: qty,
                product: "MIS",
                order_type: "LIMIT",
                price: s.price
            });

            trades.push({
                strategy:"BREAKOUT",
                symbol:s.symbol,
                qty,
                order_id:order.order_id
            });

        }catch(e){
            trades.push({strategy:"BREAKOUT",symbol:s.symbol,status:"FAILED"});
        }
    }

    // STRATEGY B
    for(let s of signalsB){
        try{
            const qty = Math.max(1, Math.floor(capitalB / s.price));

            const order = await kc.placeOrder("regular", {
                exchange: "NSE",
                tradingsymbol: s.symbol,
                transaction_type: "BUY",
                quantity: qty,
                product: "MIS",
                order_type: "LIMIT",
                price: s.price
            });

            trades.push({
                strategy:"MOMENTUM",
                symbol:s.symbol,
                qty,
                order_id:order.order_id
            });

        }catch(e){
            trades.push({strategy:"MOMENTUM",symbol:s.symbol,status:"FAILED"});
        }
    }

    return trades;
}

module.exports = runEngine;
