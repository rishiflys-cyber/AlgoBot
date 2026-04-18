
const { unifiedSignal } = require('./strategy_unified');

function runBacktest(data){
  let capital = 100000;
  let position = null;
  let trades = [];

  for(let i=1;i<data.length;i++){
    let prev = data[i-1];
    let curr = data[i];

    let signal = unifiedSignal(curr, prev);

    if(signal && !position){
      position = { type: signal, entry: curr };
    }

    if(position){
      let pnl = position.type==="BUY" ? (curr-position.entry)/position.entry : (position.entry-curr)/position.entry;

      if(pnl > 0.02 || pnl < -0.01){
        capital += capital * pnl;
        trades.push(pnl);
        position = null;
      }
    }
  }

  return { capital, trades };
}

module.exports = { runBacktest };
