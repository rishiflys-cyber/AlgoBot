let h={};
function unifiedSignal(p,prev,s){
 if(!prev) return null;
 if(!h[s]) h[s]=[];
 h[s].push(p); if(h[s].length>20) h[s].shift();
 if(h[s].length<10) return null;
 let m=h[s].reduce((a,b)=>a+b)/h[s].length;
 let v=Math.sqrt(h[s].reduce((a,x)=>a+(x-m)**2,0)/h[s].length)/m;
 let t=v*1.2, c=(p-prev)/prev;
 if(c>t) return "BUY";
 if(c<-t) return "SELL";
 return null;
}
module.exports={unifiedSignal};