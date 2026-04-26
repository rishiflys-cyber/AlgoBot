# Fix: Capital + Session Persistence

## What this fixes
- Proper accessToken handling
- Margin API logging
- Prevent silent failures

## Steps
1. Replace server.js
2. Deploy
3. Hit /login again
4. Check logs in Railway

## Debug
- See logs for margins
- Confirm capital > 0