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

async function getRealPnL(){
    const positions = await kc.getPositions();
    let pnl = 0;

    positions.net.forEach(p=>{
        pnl += p.pnl;
    });

    return pnl;
}

async function runEngine(totalCapital){

    if(!isMarketOpen()){
        return [{status:"MARKET_CLOSED_NO_EXECUTION"}];
    }

    const realPnL = await getRealPnL();
    const maxLoss = -totalCapital * 0.03;

    if(realPnL <= maxLoss){
        return [{
            status:"AUTO_SHUTDOWN",
            reason:"DAILY LOSS LIMIT HIT",
            pnl: realPnL
        }];
    }

    const signalsA = await breakout.generate(kc);
    const signalsB = await momentum.generate(kc);

    const trades = [];

    const allSignals = [
        ...signalsA.map(s=>({...s, strategy:"BREAKOUT"})),
        ...signalsB.map(s=>({...s, strategy:"MOMENTUM"}))
    ];

    for(let s of allSignals){
        try{
            const qty = Math.max(1, Math.floor((totalCapital*0.01)/(s.price*0.02)));

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
                strategy:s.strategy,
                symbol:s.symbol,
                qty,
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
