async function safeOrder(fn){
  let retries = 2;

  while(retries--){
    try{
      return await fn();
    }catch(e){
      console.error("ORDER ERROR:", e.message);
    }
  }

  return null;
}

module.exports = { safeOrder };