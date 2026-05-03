
const express = require("express");
const app = express();

const loginRoutes = require("./routes/login");
const perfRoutes = require("./routes/performance");

app.use("/", loginRoutes);
app.use("/", perfRoutes);

app.get("/", (req,res)=> res.send("AlgoBot Railway Ready"));

module.exports = app;
