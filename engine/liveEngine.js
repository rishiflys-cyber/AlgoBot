const fs = require("fs");
const KiteConnect = require("kiteconnect").KiteConnect;
const strategy = require("./strategyEngine");

const kc = new KiteConnect({ api_key: process.env.API_KEY });
kc.setAccessToken(process.env.ACCESS_TOKEN);

function isMarketOpen(){
    const now = new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" });
    const d = new Date(now);
    const t = d.getHours()*60 + d.getMinutes();
    return t >= 555 && t <= 925;
}

async function runLiveEngine(capital){

    if(!isMarketOpen()) return [{status:"MARKET_CLOSED_IST"}];

    let log = [];
    try{ log = JSON.parse(fs.readFileSync("./data/trades.json")); }catch{}

    const signals = await strategy.generateSignals(kc);
    const trades = [];

    for(let s of signals){

        const existing = log.find(t=>t.symbol === s.symbol && t.status === "LIVE");
        if(existing){
            trades.push(existing);
            continue;
        }

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

            const trade = {
                symbol:s.symbol,
                qty,
                entry,
                sl,
                target,
                order_id: order.order_id,
                status:"LIVE",
                time:new Date().toISOString()
            };

            log.push(trade);
            fs.writeFileSync("./data/trades.json", JSON.stringify(log,null,2));

            trades.push(trade);

        }catch(e){
            trades.push({symbol:s.symbol,status:"FAILED",reason:e.message});
        }
    }

    return trades;
}

module.exports = runLiveEngine;
