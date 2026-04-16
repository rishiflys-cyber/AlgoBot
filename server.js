
const express = require("express");
const path = require("path");

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

let BOT_ACTIVE = false;
let tradesToday = 0;
let position = null;
let capital = 5000;

// CONTROL
app.get("/start",(req,res)=>{BOT_ACTIVE=true;res.send("STARTED")});
app.get("/kill",(req,res)=>{BOT_ACTIVE=false;res.send("STOPPED")});

// DASHBOARD
app.get("/dashboard",(req,res)=>{
 res.json({capital,BOT_ACTIVE,position,tradesToday});
});

// SIMPLE LOGIC
function getSignal(){
 let r = Math.random();
 if(r > 0.7) return "BUY";
 if(r > 0.5) return "SMALL";
 return null;
}

// BOT LOOP
setInterval(()=>{
 if(!BOT_ACTIVE) return;
 if(tradesToday >= 2) return;

 let signal = getSignal();
 if(!signal) return;

 position = signal;
 tradesToday++;

 console.log("Trade:", signal);

},4000);

app.listen(3000,()=>console.log("AlgoBot FINAL running"));
