async function verifyFill(kite, orderId){
  try{
    let orders = await kite.getOrders();
    let o = orders.find(x => x.order_id === orderId);
    return o && o.status === "COMPLETE";
  }catch(e){
    console.error("VERIFY ERROR:", e.message);
    return false;
  }
}

module.exports = { verifyFill };