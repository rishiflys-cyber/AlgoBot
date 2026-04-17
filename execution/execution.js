async function placeEntry(kite, symbol, signal, qty, price){
  return kite.placeOrder("regular",{
    exchange:"NSE",
    tradingsymbol:symbol,
    transaction_type:signal,
    quantity:qty,
    product:"MIS",
    order_type:"LIMIT",
    price: signal==="BUY" ? price*1.001 : price*0.999
  });
}

async function placeExit(kite, symbol, signal, qty){
  return kite.placeOrder("regular",{
    exchange:"NSE",
    tradingsymbol:symbol,
    transaction_type: signal==="BUY" ? "SELL" : "BUY",
    quantity:qty,
    product:"MIS",
    order_type:"MARKET"
  });
}

module.exports = { placeEntry, placeExit };