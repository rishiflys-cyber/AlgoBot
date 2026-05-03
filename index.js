
const express = require("express");
const { KiteConnect } = require("kiteconnect");

const app = express();
const PORT = process.env.PORT || 3000;

const kc = new KiteConnect({ api_key: process.env.API_KEY });

// LOGIN
app.get("/login",(req,res)=>res.redirect(kc.getLoginURL()));

// REDIRECT
app.get("/redirect", async (req,res)=>{
  try{
    const session = await kc.generateSession(req.query.request_token, process.env.API_SECRET);
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    res.send("ACCESS_TOKEN: " + session.access_token + "<br>IP: " + ip);
  }catch(e){
    res.send(e.message);
  }
});

// AUTO EXECUTION ENGINE
app.get("/execute", async (req,res)=>{
  try{
    kc.setAccessToken(process.env.ACCESS_TOKEN);

    const symbol = "RELIANCE";
    const quote = await kc.getQuote([`NSE:${symbol}`]);
    const price = quote[`NSE:${symbol}`].last_price;

    const qty = 1;

    // BUY
    const order = await kc.placeOrder("regular",{
      exchange:"NSE",
      tradingsymbol:symbol,
      transaction_type:"BUY",
      quantity:qty,
      product:"MIS",
      order_type:"MARKET"
    });

    const sl = price * 0.97;
    const target = price * 1.05;

    res.json({
      status:"TRADE_EXECUTED",
      symbol,
      entry:price,
      sl,
      target,
      order_id:order.order_id
    });

  }catch(e){
    res.json({error:e.message});
  }
});

// PERFORMANCE
app.get("/performance", async (req,res)=>{
  try{
    kc.setAccessToken(process.env.ACCESS_TOKEN);
    const profile = await kc.getProfile();

    res.json({
      capital:8491.8,
      user:profile.user_name,
      status:"AUTO_READY",
      mode:"V97_FULL_AUTO"
    });

  }catch(e){
    res.json({error:e.message});
  }
});

app.get("/",(req,res)=>res.send("V97 AUTO RUNNING"));

app.listen(PORT,()=>console.log("V97 FULL AUTO RUNNING"));
