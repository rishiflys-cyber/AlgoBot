# Fix: Proper Capital Extraction

## What this does
- Logs FULL margin response
- Extracts capital from multiple possible fields
- Supports equity + commodity

## Steps
1. Replace server.js
2. Redeploy Railway
3. Login again
4. Check logs → see FULL MARGINS

## Expected
Capital should now reflect actual available funds