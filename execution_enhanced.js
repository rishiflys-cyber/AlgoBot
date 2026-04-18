// Upgrade 3: Execution Confirmation Wrapper (additive, no logic change)

const { confirmOrder } = require("./execution_confirm");
const { verifyFill } = require("./execution_verify");

async function safeOrderEnhanced(kite, placeFn){
  let retries = 2;

  while(retries--){
    try{
      let orderId = await placeFn();

      if(!orderId) continue;

      // confirm order exists
      let confirmed = await confirmOrder(kite, orderId);
      if(!confirmed){
        console.log("⚠️ Order not confirmed, retrying...");
        continue;
      }

      // verify fill
      let filled = await verifyFill(kite, orderId);
      if(!filled){
        console.log("⚠️ Order not filled properly");
        continue;
      }

      return orderId;

    }catch(e){
      console.error("ORDER ERROR:", e.message);
    }
  }

  return null;
}

module.exports = { safeOrderEnhanced };
