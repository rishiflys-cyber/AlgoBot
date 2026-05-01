exports.generateSignals = async function(kc){

    const watchlist = ["NSE:TCS","NSE:INFY","NSE:HDFCBANK","NSE:ICICIBANK","NSE:RELIANCE"];

    const quotes = await kc.getQuote(watchlist);

    let signals = [];

    for(let key in quotes){
        const q = quotes[key];

        const ltp = q.last_price;
        const open = q.ohlc.open;
        const high = q.ohlc.high;
        const volume = q.volume;

        // SMART FILTERS
        const bullish = ltp > open;
        const breakout = ltp > high * 0.995;
        const volumeSpike = volume > 100000;

        if(bullish && breakout && volumeSpike){
            signals.push({
                symbol: key.replace("NSE:",""),
                price: parseFloat(ltp.toFixed(2))
            });
        }
    }

    return signals.slice(0,3);
};
