
const { placeEntry, placeExit } = require('./execution');

async function safeOrder(fn){
  try{
    return await fn();
  }catch(e){
    console.error("ORDER ERROR:", e.message);
    return null;
  }
}

module.exports = { safeOrder };
