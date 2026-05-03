
const express = require("express");
const router = express.Router();
const state = require("../core/state");

router.get("/performance",(req,res)=>{
    res.json(state);
});

module.exports = router;
