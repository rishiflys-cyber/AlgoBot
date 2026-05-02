exports.generateSignals = async function(kc){

    const watchlist = ["NSE:TCS","NSE:INFY","NSE:HDFCBANK","NSE:ICICIBANK","NSE:RELIANCE"];
    const quotes = await kc.getQuote(watchlist);

    let signals = [];

    for(let key in quotes){

        const q = quotes[key];

        const ltp = q.last_price;
        const open = q.ohlc.open;
        const high = q.ohlc.high;
        const low = q.ohlc.low;
        const volume = q.volume;

        let score = 0;

        if(ltp > open) score += 1;
        if(ltp > high*0.995) score += 2;
        if(volume > 100000) score += 1;
        if((high-low)/low > 0.01) score += 1;

        if(score >= 3){
            signals.push({
                symbol:key.replace("NSE:",""),
                price:parseFloat(ltp.toFixed(2)),
                score
            });
        }
    }

    return signals.sort((a,b)=>b.score-a.score).slice(0,3);
};
