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

    // RISK SETTINGS
    const riskPerTrade = 0.01; // 1%
    const maxDailyLoss = totalCapital * 0.03; // 3%
    const maxTrades = 4;

    let totalRiskUsed = 0;
    let tradesTaken = 0;

    const signalsA = await breakout.generate(kc);
    const signalsB = await momentum.generate(kc);

    const trades = [];

    const allSignals = [
        ...signalsA.map(s=>({...s, strategy:"BREAKOUT"})),
        ...signalsB.map(s=>({...s, strategy:"MOMENTUM"}))
    ];

    for(let s of allSignals){

        if(tradesTaken >= maxTrades){
            trades.push({status:"MAX_TRADES_REACHED"});
            break;
        }

        if(totalRiskUsed >= maxDailyLoss){
            trades.push({status:"DAILY_LOSS_LIMIT_REACHED"});
            break;
        }

        try{
            const entry = s.price;
            const sl = entry * 0.98;

            const riskAmount = totalCapital * riskPerTrade;
            const qty = Math.max(1, Math.floor(riskAmount / (entry - sl)));

            totalRiskUsed += riskAmount;
            tradesTaken++;

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
                strategy:s.strategy,
                symbol:s.symbol,
                qty,
                risk: riskAmount,
                order_id:order.order_id,
                status:"PLACED"
            });

        }catch(e){
            trades.push({symbol:s.symbol,status:"FAILED",reason:e.message});
        }
    }

    return trades;
}

module.exports = runEngine;
