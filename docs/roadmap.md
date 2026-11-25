# Roadmap

## Phase 1 — Foundation and recipes ✅

- Docker image, accounts, layout, PWA, live updates, multilingual UI, units chosen for each kind of value and switchable in every input.
- Ingredient library with built-in data; editing, resetting and importing catalogs.
- Equipment profiles.
- Recipe editor with live calculations, style ranges, volumes, scaling and autosave.
- BeerXML / BeerJSON import and export.

## Phase 2 — Batches and brew day ✅

- A batch is a copy of a recipe (same document format). The brew process runs on the batch, and changes don't touch the recipe. The batch can show its differences from the original recipe and save them back as the recipe or as a new recipe.
- Brew-day mode:
  - full screen, large controls, Wake Lock (the screen stays on);
  - steps generated from the batch;
  - timers stored on the server as start times, so they survive a locked phone or a reload, synced across devices;
  - hop and other additions counted down, with alerts;
  - measured gravity and volumes, with suggested corrections (dilute, or add extract).
- Batch log and manual readings; fermentation chart.

## Phase 3 — Inventory, fermenters, water ✅

- Inventory per library item, with lot, best-before date, cost and location.
- Brew day deducts what was used, with undo. Low-stock warnings, and stock shown in the ingredient picker.
- Fermenters and kegs (vessels).
- Water: your water report, and the ions added by salts and acids (gypsum, calcium chloride, Epsom salt, salt, baking soda, chalk, lactic and phosphoric acid, acid malt).
- A solver that suggests additions to reach the target profile:
  - non-negative least squares;
  - optionally only with the salts you have in stock;
  - split between mash and sparge water.
- Mash pH estimate.

## Phase 4 — Smart devices (RAPT) ✅ (to verify with a real account)

- RAPT Pill and RAPT temperature controller / fermentation chamber, plus iSpindel (its HTTP or HTTPS Post service) and Tilt (cloud logging from the Tilt app or TiltPi to `/api/integrations/tilt/<key>`).
- Push: RAPT "Custom" Brew Data Streams post to `/api/integrations/rapt` with the header `Authorization: Bearer <stream key>`; one URL and key for all devices, which are matched by `deviceId` and added on their first message. RAPT sends at most one message every 15 minutes per device, as an envelope with the readings in `data`. RAPT also signs each message with a secret it shows once; the app doesn't check that signature, because the scheme isn't documented.
- No pull: RAPT offers no API for other apps (its only ready-made integration is Brewfather), so the target temperature is set in the RAPT app.
- **First step:** capture a real payload and confirm the API. RAPT moved its devices to a new back end on 21/09/2026, and the public documentation doesn't describe the API or the custom stream's payload.
