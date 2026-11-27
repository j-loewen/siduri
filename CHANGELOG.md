# Changelog

What's in each version of Siduri. The Docker image of each version is `ghcr.io/j-loewen/siduri:<version>`; see [Installation](docs/installation.md) for updating.

## 1.1.0 (2026-11-27)

### Updating

Nothing to do: pull the new image and restart. On the first start Siduri updates its database and the built-in library by itself.

- Built-in library items you never changed switch to the new data and stay linked to your recipes.
- Built-in items you **had edited** become your own items, with your values, and the new built-in item appears next to them.
- Built-in items you had deleted stay deleted.
- Recipes and batches keep the values they copied, as always.

### Library: open-brewing-data

- The built-in library now comes from [open-brewing-data](https://github.com/j-loewen/open-brewing-data), open data with cited sources (ODbL): about 560 fermentables, including the products of Weyermann, BESTMALZ, Briess, Château, Thomas Fawcett and other maltsters with their spec-sheet values, 180 hop varieties, 560 yeasts and bacteria, and the BJCP 2015 and 2021 styles. Generic malts show "Generic" as their producer.
- **Built-in items are read-only** and can't be deleted; they are updated with each Siduri release. **Copy and edit** turns one into your own item, e.g. with your malt lot's values. **Built-in / Yours** filters the list.
- Built-in items open as a clear list of their values in your units, not as a form.
- **Search** also finds other spellings: *CARAFA III* finds *CARAFA Type 3*.
- **Substitutes**: a built-in malt lists the same malt from other maltsters, and a hop its substitutes. In a recipe, **Swap** shows them first.
- The yeast list shows the lab under the name and a **Form** column (dry, liquid, …). Styles show their guide (BJCP 2015 or 2021) under the name.
- For MCP: `find_substitutes`, and `builtIn` on library items.

### Trash

- Deleted recipes, batches, stock items, library items, equipment profiles, fermenters and devices go to the **Trash** first and are deleted for good after 30 days (Settings → Trash: 1 day to a year, or off).
- **Undo** right after deleting, and **Restore** from the trash with all links (a batch with its recipe, fermenter, readings and log).
- For MCP: `list_trash` and `restore_from_trash`.

### Batches

- The batch page has a tab for each phase (Planning, Brewing, Fermentation, Conditioning) and opens on the one for the batch's status; Overview is read-only.

### Fixes

- A gravity reading above the original gravity no longer shows negative attenuation and ABV; the tile says to check the reading or the OG.
- The Styles tab of the library could show an error page when opened for the first time.
- On phones, the subtitle under a page title is no longer squeezed into a narrow column next to the buttons.

## 1.0.0 (2026-11-25)

First release: a self-hosted brewing app in one Docker container with a SQLite database.

### Recipes

- Recipe editor with live OG, FG, ABV, IBU, colour and BU:GU against the style's ranges, and water and wort volumes for your equipment, with a warning when the mash, the boil or the batch doesn't fit.
- Equipment profiles with volumes, losses (including mash tun dead space and mash tun loss), boil-off and efficiency; recipes scale to them.
- Ingredient lines keep their own copy of the library values, producer and origin included, so editing the library never changes a recipe.
- BeerXML 1.0 and BeerJSON 3.0 import and export (Brewfather, BeerSmith, Brewtarget and others).

### Batches and brew day

- A batch is its own copy of the recipe: change it freely, compare it with the recipe, and save the changes back or as a new recipe.
- Full-screen brew-day mode: step by step from weighing out to pitching, the screen stays on, and timers run on the server, so every device shows the same time, with an alert for each addition.
- Fermentation readings and chart, with attenuation and ABV so far.
- **Carbonation** for each batch: priming sugar for bottles or a keg (table sugar, corn sugar or dry malt extract), or the pressure and time for force carbonation, from the beer's temperature and the target CO₂.

### Smart devices

- **RAPT Pill**, controllers and chambers through RAPT's Brew Data Stream: one URL and key for all devices; each appears on its own with its first reading. Target temperatures are set in the RAPT app.
- **iSpindel** (HTTP or HTTPS Post), **Tilt** and **Tilt Pro** (cloud logging from the Tilt app or a TiltPi), and any other device or script that can post JSON.
- **Add device** shows step-by-step setup with every value ready to copy. Devices are linked to a batch on its Fermentation tab, through its fermenter when it has one.

### Inventory, water and library

- Inventory with lots, best-before dates, location and price, low-stock warnings, a shopping list for each batch, and brew-day deduction with undo.
- Fermenters and kegs, with what's in them.
- Water: your water report, a target profile, suggested salts and acid for mash and sparge, and an estimated mash pH.
- Ingredient library with about 100 malts and sugars, 54 hops, 188 yeasts, the BJCP 2015 styles and 16 water profiles, all editable. **New** adds your own items, and **Save as new** copies an item with your changes (the same malt from another maltster).

### Everything else

- **Backup files** (Settings → Backup): download recipes, batches, inventory, equipment, your own water profiles and library items, and settings as one file, choosing what goes in, and import it on this or another server. Items already there are skipped. Passwords, users, access tokens and smart devices are never in the file.
- **Claude and other AI assistants** (MCP): look up and work with recipes, batches, inventory, library and equipment, with a read, write or full access level per connection.
- Dashboard with planned and running batches, their next step and latest reading, recent recipes and what runs low.
- Units for each kind of value, metric or US, switchable in every field.
- Installable web app (PWA) for phone and desktop, light and dark themes, and live updates across devices. On a phone, the bottom bar has Dashboard, Recipes, Batches and Inventory.
- One shared brewery for everyone who signs in; only theme, language and units are per person.
