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
    let e=[values[0]];
    for(let i=1;i<values.length;i++){
        e.push(values[i]*k + e[i-1]*(1-k));
    }
    return e;
}

function bullish(x){ return x.close > x.open; }

function breakout(c){ return c[c.length-1].close >= c[c.length-2].high*0.998; }

function pullback(c, ema9){
    let p=c[c.length-1].close;
    let e=ema9[ema9.length-1];
    return Math.abs(p-e)/p < 0.003;
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

            if(trend && bullish(last) && breakout(c)){
                res.push({symbol:s.tradingsymbol, price:last.close, score:15});
            }
            else if(trend && bullish(last) && pullback(c,e9)){
                res.push({symbol:s.tradingsymbol, price:last.close, score:10});
            }

        }catch{}
    }

    return res.slice(0,10);
}

module.exports = generateSignals;
module.exports.generateSignals = generateSignals;
