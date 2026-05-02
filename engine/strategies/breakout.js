exports.generate = async function(kc){

    const watchlist = ["NSE:TCS","NSE:INFY","NSE:RELIANCE"];
    const quotes = await kc.getQuote(watchlist);

    let out = [];

    for(let k in quotes){
        const q = quotes[k];
        if(q.last_price > q.ohlc.high * 0.995){
            out.push({symbol:k.replace("NSE:",""),price:q.last_price});
        }
    }

    return out.slice(0,2);
};
