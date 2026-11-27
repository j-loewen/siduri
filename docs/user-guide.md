# User guide

- [The brewery](#the-brewery)
- [Recipes](#recipes)
- [Ingredient library](#ingredient-library)
- [Batches](#batches)
- [Fermentation](#fermentation)
- [Inventory](#inventory)
- [Equipment](#equipment)
- [Water](#water)
- [Import and export](#import-and-export)
- [Units](#units)
- [Live updates](#live-updates)
- [Install as an app](#install-as-an-app)
- [Settings](#settings)

## The brewery

Everyone who signs in shares one brewery: the same recipes, batches, inventory, library and equipment. Only the preferences (theme, language and units) are per person.

The **Dashboard** shows the batches that are brewing or fermenting with their latest reading, what runs low in the inventory, and the latest recipes.

## Recipes

**Recipes** lists all recipes with their style and key numbers. **New recipe** starts an empty one; **Import** reads BeerXML or BeerJSON files (see [Import and export](#import-and-export)).

### The editor

- At the top: the recipe's **picture** (click or drop an image), its **name**, and one row with its **style** and **equipment**. Click either to change it.
- Below that, the key numbers: **OG, FG, ABV, IBU, colour and BU:GU**, each on a bar with the style's range. They update while you type.
- Every list (fermentables, hops, yeast, other ingredients, mash, fermentation) is read-only. **Click a line to edit it** in a popup:
  - on top, the **ingredient** with **Swap** (pick another one of the same kind from the library), the amount and how it is used (mash, boil time, whirlpool, dry hop day, …);
  - below **Details**, its values: colour, potential, alpha acid, attenuation, producer, origin, … These belong to the recipe: changing them doesn't change the library.
- **Add** picks an ingredient from the library (with what's in stock), or adds one by name.
- **Producer and origin** offer the values already in the library. A new producer or origin you type stays in the recipe; to pick that ingredient again next time, add it in the [library](#ingredient-library).
- **Water & volumes** (on the right) shows the strike and sparge water, the volumes before and after the boil, and what goes into the fermenter.
- **The recipe saves itself** while you edit. If someone else changed it in the meantime, nothing is overwritten: you are asked to reload.

The **⋯** menu next to **Brew this** has **Scale** (another batch size or efficiency), **Duplicate**, **Export** and **Delete**.

### Equipment and size warnings

Click the equipment in the row under the name to choose an equipment profile. The batch size, efficiency and boil time are taken from it and can be changed for this recipe. Below **Details**, the profile's values (volumes, losses, boil-off, …) can be adjusted for this recipe only; **Use the profile's values** takes them back.

Siduri warns when something doesn't fit:

- **the mash** (grain and strike water) is larger than the mash tun (shown with the fermentables);
- **the wort before the boil** is larger than the kettle;
- **the batch** is larger than the fermenter, or leaves less than 15% free for the krausen.

### Amounts

Amounts show in the unit that reads best: `3 oz` instead of `0.19 lb`, `11 lb 6 oz`, `600 g`, `250 ml`. See [Units](#units).

## Ingredient library

**Library** has fermentables, hops, yeast, other ingredients, water profiles and beer styles.

The **built-in** entries come from [open-brewing-data](https://github.com/j-loewen/open-brewing-data), open data with cited sources: about 560 fermentables (with the products of Weyermann, BESTMALZ, Briess, Château, Thomas Fawcett and other maltsters), 180 hop varieties, 560 yeasts and bacteria and the BJCP 2015 and 2021 styles. Siduri adds the common water salts, finings and 16 water profiles. Built-in entries can't be changed or deleted: they are updated with the app when the data improves. Some values are still missing in the data, for example the attenuation of some yeasts and the description texts of the styles.

- **Search** by name, other names (e.g. *CARAFA III* finds *CARAFA Type 3*) or producer. Producer and origin show under each name. **Built-in / Yours** shows only one or the other.
- **New** (top right) adds an ingredient, water profile or style of the kind shown.
- Click an entry to see it. Your own entries can be **edited**, for example with the numbers from your maltster's analysis sheet. A built-in entry has **Copy and edit**: it becomes your own entry with the values you change (e.g. your malt lot), next to the built-in one.
- A built-in malt lists what it **can be replaced by**: the same kind of malt from other maltsters. Hops list their substitutes. In a recipe, **Swap** shows these first.
- **Save as new** (when editing your own entry) adds a copy with your changes and leaves the entry as it was: the quick way to add a hop from another harvest.
- **Import** adds the ingredients, styles and water profiles of a BeerXML or BeerJSON catalog.
- Only your own entries can be deleted.

Recipes keep their own copy of the values, so changes in the library never change a recipe.

## Batches

A batch is one brew of a recipe. **Brew this** on a recipe creates one:

- **Brew on**: choose the equipment. The recipe is scaled to its batch size and efficiency.
- **Fermenter / keg**: where the batch goes. Fermenters that are too small for the batch are marked.

The batch gets **its own copy of the recipe**: change it freely without touching the recipe. Its page has a tab for each phase, and **opens on the tab for the batch's status**: a planned batch on Planning, a fermenting one on Fermentation, a packaged one on Conditioning, a completed one on Overview. Changing the status in the header switches to its tab. Each value is entered in the tab of its phase; the Overview only shows them.

| Tab | What's there |
|---|---|
| **Overview** | Read only: status, brew date, where the batch is, whether its ingredients were taken from stock; planned against actual values; everything measured; the fermentation plan with dates; the batch notes. |
| **Recipe** | The batch's own copy of the recipe, in the same editor. |
| **Planning** | The brew date; what is in stock for this batch and what's missing; how the batch differs from its recipe, with **Save changes to recipe** or **Save as new recipe**. |
| **Brewing** | **Start brew day** (the full-screen brew-day mode, see [Brew day](brew-day.md)); the values measured on brew day (mash pH, gravities, volumes) with the brewhouse efficiency; taking the ingredients from stock. |
| **Fermentation** | The **fermenter**, the final gravity, and readings, chart and devices (see [Fermentation](#fermentation)). |
| **Conditioning** | The **keg or bottles** (moving the batch there frees its fermenter), the packaged volume, and **carbonation** (priming sugar for bottles or a keg, or the pressure and time for force carbonation). |
| **Log** | The batch notes, your log notes, and events such as the status changes. |

The status goes from *Planned* through *Brewing*, *Fermenting*, *Conditioning* and *Packaged* to *Completed*.

## Fermentation

On a batch's **Fermentation** tab:

- **Add a reading**: gravity (in SG, °Plato or Brix) and/or temperature, with a note.
- The **chart** shows gravity and temperature over time, with the apparent attenuation and the ABV so far.
- Readings from **smart devices** (RAPT Pill, iSpindel, Tilt, …) arrive on their own. A RAPT chamber or temperature controller shows its temperature and target. See [Smart devices](devices.md).

## Inventory

**Inventory** holds what you have in stock, one entry per lot.

- **Add to inventory**: pick the ingredient from the library (or type a name), and enter the amount, producer, lot, best-before date, location and price. The price is asked per unit you entered the amount in (per lb, per oz, …).
- **Warn below**: a minimum amount. Items at or below it are marked, and the dashboard lists them.
- Click an item to **add or take stock** (with a note) and to see its **history**: every purchase, adjustment and brew day.
- Items past their best-before date are marked red, those due soon orange.

**On a batch**, the inventory shows what is in stock for each ingredient and what's missing (a shopping list to copy). Brew day takes the ingredients out of stock, the oldest best-before date first; this can be undone.

Recipe lines are matched to stock by their library item, otherwise by name (and producer, if both have one), and water salts by their usual names (e.g. "Gypsum" and "Brauerei-Gips").

## Equipment

**Equipment** has three parts:

- **Equipment profiles**: your brewhouse. Batch size, boil time, efficiencies, the brew method (mash and sparge, brew in a bag, no-sparge, extract), mash tun and kettle sizes, mash tun dead space (water below the false bottom or malt pipe, added to the mash water) and mash tun loss (wort that never reaches the kettle), water-to-grain ratio, grain absorption, boil-off, losses, cooling shrinkage, the fermenter's size, and a hop utilisation factor for your system. A preview shows the water volumes for an example brew. One profile is the **default** for new recipes.
- **Fermenters and kegs**: their size, and which batch is in each.
- **Smart devices**: see [Smart devices](devices.md).

## Water

**Water** keeps your **water reports** (from your water supplier) and the target profiles. Mark one report as yours, and new recipes use it.

In a recipe's **Water** section:

- choose **your water**, how much of it is **diluted** with distilled or RO water, and a **target profile**. A target that suits the beer's colour and bitterness is suggested.
- The table compares your water, the target, the mash water and all water together, in ppm. Values close to the target are green.
- **Suggest** fills in salts (gypsum, calcium chloride, Epsom salt, table salt, baking soda) that bring your water close to the target, split between mash and sparge. **Only what I have** limits it to salts in stock.
- You also see the **SO₄:Cl ratio**, the **residual alkalinity**, an **estimated mash pH**, and how much **lactic acid** reaches your pH target (**Add** puts it in).
- Each salt or acid opens in a popup like ingredients do, where it can be **swapped** for another one.

Salts that come with imported recipes (e.g. from Brewfather) count too, and brew day tells you when to add them.

## Import and export

- **Import** (on the Recipes and Library pages) reads **BeerXML 1.0** and **BeerJSON 3.0** files from BeerSmith, Brewfather, Brewtarget and others. A preview shows what's in the file: choose which recipes, ingredients, styles, water profiles and equipment to add. Library entries that already exist are skipped.
- **Export** (in a recipe's **⋯** menu) downloads the recipe as BeerXML or BeerJSON.
- **Settings → Backup** downloads your recipes, batches, inventory, equipment, own water profiles, own library items and settings (you choose which) as one Siduri file, and imports such files again. See [Backup files](backups.md#backup-files-from-the-settings).

## Trash

Deleted recipes, batches, stock items, library items (including water profiles), equipment profiles, fermenters and devices go to the **Trash** (at the bottom of the menu) first, and are deleted for good after **30 days**. Single readings and log notes are deleted right away.

- **Undo**: right after deleting, the notification at the bottom has an **Undo** button (for a few seconds). A recipe or batch opens again.
- **Restore** puts it back as it was: a batch with its number, readings and log, a stock item with its history. Links come back too: batches to their recipe and fermenter, devices to their batch, even when both were deleted and you restore them in any order.
- **Delete for good** (the red bin on a line) or **Empty trash** when you don't want to wait.
- **Settings → Trash → Keep deleted things for** sets the time for the whole brewery: from 1 day to a year, or **Off** to delete right away. A shorter time deletes what is older at once (you are asked first).

The trash is not in [backup files](backups.md#backup-files-from-the-settings); a copy of the `data` folder contains it.

## Units

- **Settings → Units**: metric or US, or a unit for each kind of value (weights, volumes, temperature, gravity, colour, …).
- **Every field** has its own unit switch, and you can type a unit: `5 lb`, `12 °P`, `152 F`, `2.5 gal`.
- **Weights and volumes** show in the unit that reads best: below a pound in ounces, above it as `11 lb 6 oz`; below a kilogram in grams; below a litre in millilitres; below a gallon in quarts or fluid ounces. Fields with a small amount open in the smaller unit.

Everything is stored in metric units, so switching never changes your data.

## Live updates

Changes made on another device or by someone else show up right away, without reloading: recipes, batches, readings from devices, the brew-day timers. If live updates can't get through (some proxies block them), an orange cloud icon appears in the header; see [Reverse proxy](reverse-proxy.md#live-updates).

## Install as an app

Siduri can be installed as an app on phones and desktops, with its own icon and window:

- **Chrome, Edge (desktop and Android):** the install icon in the address bar, or **Install app** in the menu.
- **Safari (iPhone, iPad):** **Share → Add to Home Screen**.

This needs HTTPS (except on `localhost`): see [Reverse proxy and HTTPS](reverse-proxy.md).

## Settings

| Section | What it does |
|---|---|
| **Appearance** | Light, dark or system theme, and the language. |
| **Units** | See [Units](#units). |
| **Brewery** | The brewery's name and logo (shown in the header and on the dashboard), and the equipment for new recipes. |
| **Trash** | How long deleted things stay in the trash: see [Trash](#trash). |
| **Backup** | Download the brewery's data as one file (you choose what goes in) and import such files: see [Backup files](backups.md#backup-files-from-the-settings). |
| **Claude & AI assistants** | Connections for Claude Code or Claude Desktop: see [Claude and AI assistants](mcp.md). |
| **Account** | Your display name and password. |
