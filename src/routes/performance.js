
const express = require("express");
const router = express.Router();

router.get("/performance",(req,res)=>{
    res.json({
        status:"RUNNING_ON_RAILWAY",
        mode:"FINAL"
    });
});

module.exports = router;
