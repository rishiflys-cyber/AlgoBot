async function confirmOrder(kite, orderId){
  try{
    const orders = await kite.getOrders();
    return orders.find(o => o.order_id === orderId && o.status === "COMPLETE");
  }catch(e){
    console.error("CONFIRM ERROR:", e.message);
    return null;
  }
}

module.exports = { confirmOrder };