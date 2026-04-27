
require('dotenv').config();
const express = require('express');
const fs = require('fs');
const axios = require('axios');
const KiteConnect = require("kiteconnect").KiteConnect;

const app = express();
const PORT = process.env.PORT || 3000;

const LIVE = process.env.LIVE_TRADING === "true";
const FORCE_PAPER = process.env.FORCE_PAPER === "true";

let kite = new KiteConnect({ api_key: process.env.KITE_API_KEY });

let state = {
  capital: 100000,
  peakCapital: 100000,
  pnl: 0,
  serverIP: null,
  rankedSignals: [],
  activeTrades: [],
  closedTrades: [],
  weights: {trend:0.3, strength:0.3, volatility:0.2, volume:0.2},
  mode: FORCE_PAPER ? "PAPER" : (LIVE ? "LIVE" : "PAPER")
};

// IP
(async ()=>{
  try{
    const ip = await axios.get("https://api.ipify.org?format=json");
    state.serverIP = ip.data.ip;
  }catch{}
})();

// Universe (expanded)
const universe = [
"NSE:RELIANCE","NSE:TCS","NSE:INFY","NSE:HDFCBANK","NSE:ICICIBANK",
"NSE:SBIN","NSE:AXISBANK","NSE:KOTAKBANK","NSE:ITC","NSE:LT",
"NSE:WIPRO","NSE:ULTRACEMCO","NSE:MARUTI","NSE:BAJFINANCE","NSE:ASIANPAINT",
"NSE:HCLTECH","NSE:TECHM","NSE:TITAN","NSE:ADANIENT","NSE:ADANIPORTS",
"NSE:ONGC","NSE:NTPC","NSE:POWERGRID","NSE:TATASTEEL","NSE:HINDALCO"
];

// quotes
async function getQuotes(symbols){
  let result = {};
  for(let i=0;i<symbols.length;i+=50){
    try{
      const q = await kite.getQuote(symbols.slice(i,i+50));
      result = {...result,...q};
    }catch(e){
      console.log("QUOTE ERROR:", e.message);
    }
  }
  return result;
}

// scoring
function score(q){
  const p=q.last_price,o=q.ohlc.open,h=q.ohlc.high,l=q.ohlc.low,v=q.volume||1;

  if(!p||!o||!h||!l) return 0;

  const trend = (p-o)/o;
  const strength = (p-l)/(h-l+0.0001);
  const volatility = (h-l)/o;
  const volume = Math.log(v+1)/10;

  return (
    trend*state.weights.trend +
    strength*state.weights.strength +
    volatility*state.weights.volatility +
    volume*state.weights.volume
  );
}

// allocation
function allocate(signals){
  const risk = state.capital * 0.01;
  const maxExp = state.capital * 0.5;

  let used=0, out=[];

  for(const s of signals){
    const stop = s.price * 0.01;
    let qty = Math.floor(risk / stop);
    if(qty<=0) qty=1;

    const exp = qty*s.price;
    if(used + exp > maxExp) continue;

    used += exp;
    out.push({...s, qty});
  }
  return out;
}

// learning engine
function updateWeights(){
  if(state.closedTrades.length < 5) return;

  const wins = state.closedTrades.filter(t=>t.pnl>0).length;
  const losses = state.closedTrades.length - wins;

  if(wins > losses){
    state.weights.trend += 0.01;
    state.weights.strength += 0.01;
  } else {
    state.weights.volatility += 0.01;
  }

  // normalize
  const total = Object.values(state.weights).reduce((a,b)=>a+b,0);
  for(let k in state.weights){
    state.weights[k] /= total;
  }
}

// engine loop
setInterval(async ()=>{
  const quotes = await getQuotes(universe);

  let signals=[];

  for(const s of universe){
    const q = quotes[s];
    if(!q) continue;

    signals.push({
      symbol:s,
      price:q.last_price,
      score:score(q)
    });
  }

  console.log("TOTAL SIGNALS:", signals.length);

  signals.sort((a,b)=>b.score-a.score);

  let top = signals.slice(0,10);
  let allocated = allocate(top).slice(0,5);

  // fallback
  if(allocated.length === 0 && top.length > 0){
    allocated = top.slice(0,3).map(s => ({...s, qty:1}));
  }

  state.rankedSignals = allocated;

  // trades
  for(const s of allocated){
    if(state.activeTrades.find(t=>t.symbol===s.symbol)) continue;

    state.activeTrades.push({
      symbol:s.symbol,
      entry:s.price,
      qty:s.qty,
      sl:s.price*0.99,
      target:s.price*1.02,
      startTime:Date.now()
    });
  }

  // simulate exit
  state.activeTrades = state.activeTrades.filter(t=>{
    const current = t.entry * (1 + (Math.random()-0.5)*0.02);

    if(current >= t.target || current <= t.sl){
      const pnl = (current - t.entry) * t.qty;
      state.pnl += pnl;
      state.closedTrades.push({...t, exit:current, pnl});
      return false;
    }
    return true;
  });

  updateWeights();

},5000);

// api
app.get('/performance',(req,res)=>res.json(state));

// UI
app.get('/',(req,res)=>{
  res.send(`
  <html>
  <script>
  async function load(){
    const r=await fetch('/performance');
    const d=await r.json();
    document.getElementById('d').innerText=JSON.stringify(d,null,2);
  }
  setInterval(load,2000);
  window.onload=load;
  </script>
  <body style="background:black;color:#0f0;font-family:monospace">
  <h2>V46 LEARNING ENGINE</h2>
  <pre id="d"></pre>
  </body></html>
  `);
});

app.listen(PORT,()=>console.log("V46 RUNNING"));
