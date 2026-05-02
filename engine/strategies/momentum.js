exports.generate = async function(kc){

    const watchlist = ["NSE:HDFCBANK","NSE:ICICIBANK"];
    const quotes = await kc.getQuote(watchlist);

    let out = [];

    for(let k in quotes){
        const q = quotes[k];
        if(q.last_price > q.ohlc.open){
            out.push({symbol:k.replace("NSE:",""),price:q.last_price});
        }
    }

    return out.slice(0,2);
};
