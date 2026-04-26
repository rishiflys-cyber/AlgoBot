# AlgoBot Integration Patch (Non-breaking)

## Steps
1. Copy each patch into `server.js` at the indicated locations.
2. Do NOT remove existing fields or logic (except SL/TP replacement).
3. Start server:
   node server.js

## Verify
- Dashboard loads
- scanOutput contains: tradeQualityScore, regime, regimeStrength
- No crashes

## Git Push
git add .
git commit -m "feat: integrate decision engine + regime + volatility + dynamic SL"
git push origin main