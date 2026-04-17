// FIXED ENGINE (UI PATH CORRECTED)

const path = require("path");
const express = require("express");

const app = express();

// FIX: use public instead of ui
app.use(express.static(path.join(__dirname, "../public")));

app.get("/", (req,res)=>{
  res.sendFile(path.join(__dirname, "../public/index.html"));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, ()=>console.log("Engine running"));
