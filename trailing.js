
function updateTrailing(entry, current, type, trailPct){
  if(type==="BUY"){
    return Math.max(entry*(1-trailPct), current*(1-trailPct));
  } else {
    return Math.min(entry*(1+trailPct), current*(1+trailPct));
  }
}
module.exports = { updateTrailing };
