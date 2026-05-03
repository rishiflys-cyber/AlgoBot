
const express = require("express");
const router = express.Router();
const state = require("../core/state");

router.get("/performance",(req,res)=>{
    res.json({
        capital: state.capital,
        trades: state.trades,
        closedTrades: state.closedTrades,
        debug: state.debug,
        ip: state.ip,
        mode: "SMART_DEBUG"
    });
});

module.exports = router;
