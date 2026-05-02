const express = require("express");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

const CAPITAL = 8491.8;

// DASHBOARD
app.use(express.static(path.join(__dirname,"public")));

// PERFORMANCE WITH CAPITAL FIX
app.get("/performance", async (req,res)=>{
  const engine = require("./engine/liveEngine");
  const result = await engine.run();

  res.json({
    capital: CAPITAL,
    ...result
  });
});

app.get("/", (req,res)=>res.sendFile(path.join(__dirname,"public","index.html")));

app.listen(PORT,()=>console.log("V79 CAPITAL FIX RUNNING"));
