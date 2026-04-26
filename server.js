// SIMPLE WORKING SERVER WITH /performance ROUTE

require("dotenv").config();
const express = require("express");

const app = express();

// ROOT
app.get("/", (req, res) => {
  res.send("AlgoBot Running");
});

// PERFORMANCE ROUTE (FIX)
app.get("/performance", (req, res) => {
  res.json({
    status: "working",
    time: new Date()
  });
});

// START SERVER
app.listen(process.env.PORT || 3000, () => {
  console.log("Server running...");
});
