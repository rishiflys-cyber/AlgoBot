const fs = require('fs');
const path = require('path');
const KiteConnect = require("kiteconnect").KiteConnect;

const kc = new KiteConnect({ api_key: process.env.API_KEY });

const accessToken = fs.readFileSync(path.join(__dirname, "../access_token.txt"), "utf8").trim();
kc.setAccessToken(accessToken);

// FULL NSE200 (NO LIMIT)
const symbols = require("../nse200.json");

async function getHistorical(token) {
    try {
        const to = new Date();
        const from = new Date(to.getTime() - (4 * 60 * 60 * 1000)); // 4 hrs
        return await kc.getHistoricalData(token, from, to, "5minute");
    } catch {
        return [];
    }
}

function ema(values, period){
    const k = 2/(period+1);
    let e=[values[0]];
    for(let i=1;i<values.length;i++){
        e.push(values[i]*k + e[i-1]*(1-k));
    }
    return e;
}

function bullish(x){ return x.close > x.open; }

function breakout(c){ return c[c.length-1].close >= c[c.length-2].high * 0.995; }

function pullback(c, ema9){
    let p=c[c.length-1].close;
    let e=ema9[ema9.length-1];
    return Math.abs(p-e)/p < 0.007; // aggressive
}

function quickMomentum(c){
    return c[c.length-1].close > c[c.length-2].close;
}

async function generateSignals(capital){
    if(capital<5000) return [];

    let res=[];

    for(let s of symbols){
        try{
            let c=await getHistorical(s.instrument_token);
            if(!c || c.length<10) continue;

            let closes=c.map(x=>x.close);
            let e9=ema(closes,9);
            let e21=ema(closes,21);

            let trend=e9[e9.length-1] > e21[e21.length-1];
            let last=c[c.length-1];

            // AGGRESSIVE BREAKOUT
            if(trend && bullish(last) && breakout(c)){
                res.push({symbol:s.tradingsymbol, price:last.close, score:20});
            }

            // AGGRESSIVE PULLBACK
            else if(trend && bullish(last) && pullback(c,e9)){
                res.push({symbol:s.tradingsymbol, price:last.close, score:15});
            }

            // FAST SCALP ENTRY
            else if(bullish(last) && quickMomentum(c)){
                res.push({symbol:s.tradingsymbol, price:last.close, score:8});
            }

        }catch{}
    }

    return res.slice(0,20); // more trades
}

module.exports = generateSignals;
module.exports.generateSignals = generateSignals;
