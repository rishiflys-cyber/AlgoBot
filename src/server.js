
const app = require("./app");
const PORT = process.env.PORT || 3000;

require("./engine/engine");

app.listen(PORT, () => console.log("REAL EXECUTION ENGINE RUNNING", PORT));
