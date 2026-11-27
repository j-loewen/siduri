# Claude and AI assistants

Siduri has an [MCP](https://modelcontextprotocol.io) server, so Claude can work with your brewery. For example, Claude can:
- look up recipes, batches, the inventory and the ingredient library;
- calculate changes;
- make a shopping list;
- add stock;
- adjust recipes.

Claude Code and Claude Desktop connect to it over your network with an access token. Siduri doesn't have to be reachable from the internet.

## Connect

1. In Siduri, open **Settings → Claude & AI assistants** and click **New connection**.
2. Give it a name (for example "Claude Code") and choose what it may do (see [Levels](#levels)).
3. Copy the token. It is shown only once; Siduri stores only a hash of it.
4. Set up the client. The dialog shows both setups ready to copy.

**Claude Code**

```sh
claude mcp add --transport http siduri http://<server>:<port>/mcp --header "Authorization: Bearer siduri_…"
```

**Claude Desktop**

Claude Desktop talks to remote servers through the small `mcp-remote` bridge, which needs Node.js on that computer. Add this under Settings → Developer → Edit config, then restart Claude Desktop:

```json
{
  "mcpServers": {
    "siduri": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "http://<server>:<port>/mcp", "--allow-http", "--header", "Authorization:${SIDURI_AUTH}"],
      "env": { "SIDURI_AUTH": "Bearer siduri_…" }
    }
  }
}
```

`--allow-http` is needed for a plain `http://` address on your network. Leave it out with `https://`.

Use an address of the Siduri server that the computer running Claude can reach. The settings dialog uses the address your browser uses.

## Levels

Each connection has a level. You can change it at any time in the settings; it applies to the next request.

| Level | Claude may |
|---|---|
| **Read** | Look up everything: overview, recipes with calculated values, batches with readings and log, inventory, library, equipment, and the ingredients-vs-stock plan. Nothing is changed. |
| **Read & write** | Also create and change recipes (including import), batches (status, fermenter, measured values, carbonation, the batch's recipe), notes, readings, stock (add, adjust), library items, equipment profiles, fermenters and kegs, and which fermenter or batch a smart device measures. Nothing is deleted. |
| **Everything** | Also delete things, run brew-day actions (start, check steps, timers), and take a batch's ingredients from the inventory or put them back. |

Users, passwords, the settings, device accounts and the tokens themselves are never available to Claude.

Changes made by Claude show up live in open browser tabs. A batch's log notes changes to the batch made through a connection, e.g. "Recipe changed via Claude Code".

## Tools

| Tool | Level | What it does |
|---|---|---|
| `get_overview` | read | Brewery name, your display units, active batches, low stock, equipment and fermenters. |
| `search_library`, `get_library_item` | read | Ingredients, water profiles and styles, by name, other name or producer. Built-in items are marked `builtIn`. |
| `find_substitutes` | read | Built-in malts or hops that can replace a built-in one (the same malt from other maltsters, hop substitutes). |
| `list_equipment` | read | Equipment profiles, fermenters and kegs, and smart devices with their last reading (without their push URL). |
| `list_recipes`, `get_recipe` | read | Recipes. A recipe comes with its calculated values (OG, FG, ABV, IBU, colour, grist, volumes, water chemistry, vessels that are too small). |
| `calculate_recipe` | read | The calculated values of a changed recipe document, without saving it. |
| `export_recipe` | read | BeerXML or BeerJSON text. |
| `list_batches`, `get_batch` | read | Batches, with their recipe copy, readings, log and brew-day steps. |
| `list_inventory`, `get_inventory_item` | read | Stock and its history. |
| `plan_ingredients` | read | A recipe or batch against the stock: what is there, which lot it comes from, and what to buy. |
| `list_trash` | read | What is in the trash, and when each thing is deleted for good. |
| `create_recipe`, `update_recipe`, `duplicate_recipe`, `import_recipe` | write | Recipes. Saves need the version that was read; a stale save is refused. |
| `create_library_item`, `update_library_item` | write | The brewery's own library items. Built-in items can't be changed or deleted: create an own item with their values instead. |
| `add_inventory_item`, `update_inventory_item`, `adjust_inventory` | write | Stock. Amount changes are recorded in the item's history. |
| `create_batch`, `update_batch`, `update_batch_recipe`, `add_batch_note`, `add_reading`, `save_batch_to_recipe` | write | Batches. |
| `create_equipment_profile`, `update_equipment_profile`, `set_default_equipment` | write | Equipment profiles. Recipes keep their own copy of the equipment values. |
| `create_vessel`, `update_vessel` | write | Fermenters, kegs and other vessels. |
| `update_device` | write | Rename a smart device, or put it in a fermenter or link it to a batch. Devices themselves are added in the app. |
| `restore_from_trash` | write | Put something deleted back as it was, with its links (batch to recipe and fermenter, device to batch). |
| `delete_recipe`, `delete_batch`, `delete_library_item`, `delete_inventory_item`, `delete_reading`, `delete_note`, `delete_equipment_profile`, `delete_vessel`, `delete_device` | full | Deleting. Everything but readings and notes goes to the trash first. |
| `brew_day_action` | full | Brew-day actions, applied with the server clock. |
| `deduct_batch_inventory`, `undo_batch_deduction` | full | Take a batch's ingredients from the inventory, or put them back. |

All values are in canonical units (kg, L, °C, SG, EBC, minutes). Claude is told your display units and converts them when it talks to you.

## Things to try

- "What can I brew with what I have in stock?"
- "Plan the ingredients for London Pride and make me a shopping list."
- "I bought 5 kg Pilsner malt from Weyermann, lot 2411. Add it to the inventory."
- "Make a Hefeweizen recipe for my BrewZilla, using yeast I have."
- "The kettle is too small for this recipe. Scale it so it fits."
- "How is batch #5 fermenting? Compare the readings with the expected FG."
- "I measured 2.4 L boil-off per hour on the BrewZilla. Update the equipment profile."
- "I moved the Pill to FV2."

## Security

- The endpoint is `POST /mcp`. It accepts only a valid access token (`Authorization: Bearer siduri_…`); the login cookie is not accepted there.
- Requests from a web page on another site are refused (`Origin` check; set `BASE_URL` if Siduri is reached through a reverse proxy).
- Tokens are personal (each user sees only their own), but the brewery data they reach is shared, as in the app.
- A token you no longer need: revoke it in the settings. It stops working immediately.
- Each tool call is logged with the connection name.
- claude.ai (web and mobile) can't connect yet: it connects from Anthropic's servers, which needs Siduri on the internet and an OAuth login.
