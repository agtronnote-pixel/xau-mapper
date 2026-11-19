# XAU Mapper (PWA)

**Live app:** https://agtronnote-pixel.github.io/xau-mapper/

A Progressive Web App that runs a six-agent analysis team on live XAU/USD data for each stage of the trading day: Prep, Asia, London, New York and Close. It needs no Python, MT5 or installer; it runs in Edge or Chrome and installs like an app.

## What you need
- **Claude API key** from console.anthropic.com. It's billed per use.
- **Twelve Data API key** from twelvedata.com. The free plan covers 800 credits a day, and each stage uses 7.
- The app hosted on an HTTPS address (for example, GitHub Pages). Browsers only install PWAs from HTTPS.

## Use
1. Open the app's address in Edge or Chrome, and click **Install app** at the top right (or the install icon in the address bar).
2. In **Settings**, paste both keys and pick a model.
3. On **Run**, pick a stage (the one for the current WIB time is marked **now**) and click **Run stage**. Keep the window open for the 1–3 minutes the stage takes.
4. Past maps are under **Reports**.

## How it works
`app.js` fetches 7 timeframes (MN1 down to M5) from Twelve Data. It then computes EMA, RSI and ATR, the session ranges and key levels (the same maths as the MT5 version, checked by `test/test_app.js`). After that it calls Claude: four specialists in parallel, then Risk, then the Chief Strategist. Agent instructions are in `agents/*.md`.

## Data
- Twelve Data supplies a spot XAU/USD composite feed. It has no volume and no bid/ask spread, and prices can differ by a few tenths from your broker's MT5 quotes.
- D1 candles close at 00:00 UTC, not at the New York close.
- Keys and reports are stored in this browser only (localStorage). Clearing site data removes them.

## Develop
- Serve locally with `python -m http.server 8800` and open http://localhost:8800.
- Run the tests with `node test/test_app.js`.
- After changing files, bump `VERSION` in `sw.js` so installed copies update.

## Limits
"Thinks like" means each agent follows that expert's published methods. It doesn't give the agent their skill. Treat the maps as structured analysis, not trading signals, and paper-trade first.
