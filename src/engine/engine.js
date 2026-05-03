
const fs = require("fs");
const { KiteConnect } = require("kiteconnect");
const state = require("../core/state");

const kc = new KiteConnect({ api_key: process.env.API_KEY });

function loadToken(){
  try{
    return fs.readFileSync("access_token.txt","utf8");
  }catch{
    return null;
  }
}

async function updateCapital(){
  try{
    const token = loadToken();
    if(!token) return;

    kc.setAccessToken(token);

    const margins = await kc.getMargins();

    state.capital = margins.equity.available.cash || 0;

  }catch(e){
    console.log("CAPITAL ERROR", e.message);
  }
}

async function updateIP(){
  try{
    const res = await fetch("https://api.ipify.org?format=json");
    const data = await res.json();
    state.ip = data.ip;
  }catch{}
}

setInterval(async ()=>{
  await updateCapital();
  await updateIP();
},10000);
