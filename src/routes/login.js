
const express = require("express");
const router = express.Router();
const { KiteConnect } = require("kiteconnect");

const kc = new KiteConnect({ api_key: process.env.API_KEY });

router.get("/login",(req,res)=> res.redirect(kc.getLoginURL()));

router.get("/redirect", async (req,res)=>{
    try{
        const session = await kc.generateSession(
            req.query.request_token,
            process.env.API_SECRET
        );

        process.env.ACCESS_TOKEN = session.access_token;

        res.send("ACCESS_TOKEN: "+session.access_token);

    }catch(e){
        res.send(e.message);
    }
});

module.exports = router;
