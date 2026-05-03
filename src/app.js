
const express = require("express");
const app = express();

app.use("/", require("./routes/login"));
app.use("/", require("./routes/performance"));

app.get("/", (req,res)=> res.send("FINAL FIX ENGINE"));

module.exports = app;
