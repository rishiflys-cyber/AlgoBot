
require("dotenv").config();
const express = require("express");
const fs = require("fs");
const axios = require("axios");
const { KiteConnect } = require("kiteconnect");

const app = express();
const kite = new KiteConnect({ api_key: process.env.KITE_API_KEY });

let access_token=null;
let BOT_ACTIVE=false;
let MANUAL_KILL=false;

let activeTrades=[];
let closedTrades=[];
let pnl=0;

const STATE_FILE = "state.json";

// LOAD STATE
if (fs.existsSync(STATE_FILE)) {
  try {
    const data = JSON.parse(fs.readFileSync(STATE_FILE));
    activeTrades = data.activeTrades || [];
    closedTrades = data.closedTrades || [];
  } catch(e){}
}

// SAVE STATE
function saveState(){
  fs.writeFileSync(STATE_FILE, JSON.stringify({activeTrades, closedTrades}));
}

const STOCKS=["RELIANCE","TCS","INFY","HDFCBANK","ICICIBANK"];

// UI
app.get("/",(req,res)=>{
 res.send(`
 <h2>FINAL BOT (LOGIN + REAL PNL)</h2>
 <button onclick="location.href='/login'">Login</button>
 <button onclick="fetch('/start')">Start</button>
 <button onclick="fetch('/kill')">Kill</button>
 <pre id="data"></pre>
 <script>
 setInterval(async()=>{
  let r=await fetch('/performance');
  let d=await r.json();
  document.getElementById('data').innerText=JSON.stringify(d,null,2);
 },2000);
 </script>
 `);
});

// ✅ FIXED LOGIN ROUTE
app.get("/login",(req,res)=>{
  res.redirect(kite.getLoginURL());
});

// LOGIN REDIRECT + IP
app.get("/redirect", async (req, res) => {
  try {
    const s = await kite.generateSession(
      req.query.request_token,
      process.env.KITE_API_SECRET
    );

    access_token = s.access_token;
    kite.setAccessToken(access_token);
    BOT_ACTIVE = true;

    let ip="unknown";
    try{
      const ipRes = await axios.get("https://api.ipify.org?format=json");
      ip = ipRes.data.ip;
    }catch(e){}

    res.send("<h2>Login Success</h2><p>Whitelist IP: "+ip+"</p>");

  } catch (err) {
    res.send("Login failed");
  }
});

app.get("/start",(req,res)=>{BOT_ACTIVE=true;MANUAL_KILL=false;res.send("STARTED");});
app.get("/kill",(req,res)=>{BOT_ACTIVE=false;MANUAL_KILL=true;res.send("STOPPED");});

// PROBABILITY
function prob(a){
 if(a.length<4) return 0;
 let up=0;
 for(let i=1;i<a.length;i++){ if(a[i]>a[i-1]) up++; }
 return up/a.length;
}

let history={};

setInterval(async()=>{
 if(!access_token || MANUAL_KILL) return;

 try{
  const prices=await kite.getLTP(STOCKS.map(s=>`NSE:${s}`));

  for(let s of STOCKS){

    let p=prices[`NSE:${s}`]?.last_price;
    if(!p) continue;

    if(!history[s]) history[s]=[];
    history[s].push(p);
    if(history[s].length>6) history[s].shift();

    let pr=prob(history[s]);

    let signal=null;

    if(pr>=0.5){
      signal = history[s].at(-1) > history[s].at(-2) ? "BUY":"SELL";
    }
    else if(pr>=0.3){
      signal = history[s].at(-1) > history[s].at(-2) ? "BUY":"SELL";
    }

    if(signal && !activeTrades.find(t=>t.symbol===s)){

      let qty=1;

      await kite.placeOrder("regular",{
        exchange:"NSE",
        tradingsymbol:s,
        transaction_type:signal,
        quantity:qty,
        product:"MIS",
        order_type:"MARKET",
        market_protection:2
      });

      activeTrades.push({symbol:s,entry:p,type:signal,qty});
      saveState();
    }
  }

  let remaining=[];

  for(let t of activeTrades){
    let cp=prices[`NSE:${t.symbol}`]?.last_price;
    if(!cp) continue;

    let profit = t.type==="BUY"?(cp-t.entry):(t.entry-cp);

    if(profit > t.entry*0.0035 || profit < -t.entry*0.002){

      let finalProfit = profit * t.qty;

      await kite.placeOrder("regular",{
        exchange:"NSE",
        tradingsymbol:t.symbol,
        transaction_type: t.type==="BUY"?"SELL":"BUY",
        quantity:t.qty,
        product:"MIS",
        order_type:"MARKET",
        market_protection:2
      });

      closedTrades.push({
        symbol: t.symbol,
        profit: finalProfit
      });

    } else {
      remaining.push(t);
    }
  }

  activeTrades = remaining;
  saveState();

  // 🔥 REAL PNL
  let realized = closedTrades.reduce((sum,t)=>sum+t.profit,0);

  let unrealized = 0;
  for(let t of activeTrades){
    let cp=prices[`NSE:${t.symbol}`]?.last_price;
    if(!cp) continue;

    let profit = t.type==="BUY"
      ? (cp-t.entry)*t.qty
      : (t.entry-cp)*t.qty;

    unrealized += profit;
  }

  pnl = realized + unrealized;

 }catch(e){
  console.log("ERROR:", e.message);
 }

},3000);

app.get("/performance",(req,res)=>{
 res.json({
  pnl,
  activeTradesCount: activeTrades.length,
  closedTradesCount: closedTrades.length,
  activeTrades,
  closedTrades
 });
});

app.listen(process.env.PORT||3000);
