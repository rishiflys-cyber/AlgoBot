
const express = require("express");
const router = express.Router();
const state = require("../core/state");

router.get("/performance",(req,res)=>{
    res.json({
        capital: state.capital,
        trades: state.trades,
        closedTrades: state.closedTrades,
        mode: "FINAL_FULL_ENGINE"
    });
});

module.exports = router;
