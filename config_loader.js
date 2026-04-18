// FIXED CONFIG PATH — NO LOGIC CHANGE

let CONFIG;

try {
  CONFIG = require('./config');
} catch (e) {
  try {
    CONFIG = require('./config/config');
  } catch (e2) {
    try {
      CONFIG = require('./core/config');
    } catch (e3) {
      console.error("❌ Cannot locate config.js. Check folder structure.");
      throw e3;
    }
  }
}

module.exports = CONFIG;