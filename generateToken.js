require('dotenv').config();
const { KiteConnect } = require("kiteconnect");

const kc = new KiteConnect({
    api_key: process.env.API_KEY
});

// 🔴 PASTE YOUR REQUEST TOKEN HERE
const REQUEST_TOKEN = "V0nag1br7QG5zYh0W4gficsfxlfTpcvp";

(async () => {
    try {
        const res = await kc.generateSession(REQUEST_TOKEN, process.env.API_SECRET);

        console.log("\n✅ ACCESS TOKEN:\n");
        console.log(res.access_token);

    } catch (e) {
        console.error("❌ ERROR:", e.message);
    }
})();