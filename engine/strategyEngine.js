const fs = require('fs');
const path = require('path');
const KiteConnect = require("kiteconnect").KiteConnect;

const kc = new KiteConnect({ api_key: process.env.API_KEY });

const accessToken = fs.readFileSync(path.join(__dirname, "../access_token.txt"), "utf8").trim();
kc.setAccessToken(accessToken);

const symbols = require("../nse200.json").slice(0, 40);

async function getHistorical(token) {
    try {
        const to = new Date();
        const from = new Date(to.getTime() - (2 * 60 * 60 * 1000));
        return await kc.getHistoricalData(token, from, to, "5minute");
    } catch {
        return [];
    }
}

function ema(values, period){
    const k = 2/(period+1);
    let emaArr = [values[0]];
    for(let i=1;i<values.length;i++){
        emaArr.push(values[i]*k + emaArr[i-1]*(1-k));
    }
    return emaArr;
}

function momentum(c){
    return c[c.length-1].close > c[c.length-2].close &&
           c[c.length-2].close > c[c.length-3].close;
}

function breakout(c){
    return c[c.length-1].close >= c[c.length-2].high * 0.998;
}

function bullish(x){
    return x.close > x.open;
}

function volumeSpike(c){
    let last = c[c.length-1].volume;
    let avg = c.slice(-6,-1).reduce((a,b)=>a+b.volume,0)/5;
    return last > avg * 1.3;
}

// NEW: Pullback logic
function pullbackEntry(c, ema9){
    const last = c[c.length-1];
    const price = last.close;
    const emaVal = ema9[ema9.length-1];

    return Math.abs(price - emaVal)/price < 0.002; // near EMA
}

async function generateSignals(capital){
    if(capital < 5000) return [];

    const results=[];

    for(let s of symbols){
        try{
            const c = await getHistorical(s.instrument_token);
            if(!c || c.length < 10) continue;

            const closes = c.map(x=>x.close);
            const ema9 = ema(closes,9);
            const ema21 = ema(closes,21);

            const last = c[c.length-1];

            const trend = ema9[ema9.length-1] > ema21[ema21.length-1];

            // PRIMARY: breakout
            if(
                breakout(c) &&
                bullish(last) &&
                momentum(c) &&
                volumeSpike(c) &&
                trend
            ){
                results.push({
                    symbol: s.tradingsymbol,
                    price: last.close,
                    score: 15
                });
            }

            // SECONDARY: pullback
            else if(
                trend &&
                bullish(last) &&
                pullbackEntry(c, ema9)
            ){
                results.push({
                    symbol: s.tradingsymbol,
                    price: last.close,
                    score: 10
                });
            }

        }catch{}
    }

    return results.slice(0,10);
}

module.exports = generateSignals;
module.exports.generateSignals = generateSignals;
