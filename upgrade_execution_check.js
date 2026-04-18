async function confirmFill(kite, order){
  try{
    const orders = await kite.getOrders();
    const o = orders.find(x => x.order_id === order.order_id);
    return o && o.status === "COMPLETE";
  }catch(e){
    console.error("FILL CHECK ERROR:", e.message);
    return false;
  }
}
module.exports = { confirmFill };