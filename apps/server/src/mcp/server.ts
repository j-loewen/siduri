import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { APP_ID, APP_NAME, tokenAllows } from '@brew/shared';
import { HttpError } from '../lib/errors';
import type { ToolContext, ToolDef } from './tool';
import { batchTools } from './tools/batches';
import { equipmentTools } from './tools/equipment';
import { inventoryTools } from './tools/inventory';
import { libraryTools } from './tools/library';
import { overviewTools } from './tools/overview';
import { recipeTools } from './tools/recipes';
import { trashTools } from './tools/trash';

/** Every tool, each with the least token level that may use it. */
export const ALL_TOOLS: ToolDef[] = [...overviewTools, ...libraryTools, ...equipmentTools, ...recipeTools, ...batchTools, ...inventoryTools, ...trashTools];

const INSTRUCTIONS = `${APP_NAME} is a self-hosted brewing app: recipes, batches (brews of a recipe), ingredient inventory, an ingredient library, equipment and water profiles. All its data is shared by the brewery.
- Start with get_overview: it tells the brewery name, the user's preferred display units and what is going on (active batches, low stock).
- All values are in canonical units: kg, L, °C, specific gravity (SG, e.g. 1.050), colour in EBC, minutes, % and ppm. Convert to the user's preferred units when you talk to them.
- Recipes and batch recipes are JSON documents. Read one with get_recipe / get_batch, change the document and save it with its "version"; a stale version is refused, then read it again. Ingredient lines are copies of library values (libraryRef points to the library item); keep line ids when changing lines.
- Use calculate_recipe to see OG, FG, ABV, IBU, colour and volumes of a changed document before saving it.
- plan_ingredients compares a recipe or batch with the inventory: what is in stock and what to buy.
- list_equipment shows the equipment profiles, fermenters/kegs and smart devices. A recipe keeps its own copy of an equipment profile (doc.equipment); changing a profile doesn't change recipes.`;

/** No float noise in results (0.019999999999999997 → 0.02): six decimals are plenty in kg, L and SG. */
const roundNumbers = (_key: string, value: unknown) => (typeof value === 'number' && !Number.isInteger(value) ? Math.round(value * 1e6) / 1e6 : value);

function errorText(err: unknown): string {
  if (err instanceof HttpError) {
    const details = Array.isArray(err.details) && err.details.length ? `\n${JSON.stringify(err.details)}` : '';
    const hint = err.statusCode === 409 ? ' Read it again to get the current version, then repeat your change.' : '';
    return `${err.message}${hint}${details}`;
  }
  return 'Something went wrong on the server.';
}

/** An MCP server with the tools a token of this level may use (one per request: the transport is stateless). */
export function createMcpServer(ctx: ToolContext, version: string): McpServer {
  const server = new McpServer({ name: APP_ID, title: APP_NAME, version }, { instructions: INSTRUCTIONS });
  for (const def of ALL_TOOLS) {
    if (!tokenAllows(ctx.level, def.level)) continue;
    server.registerTool(
      def.name,
      {
        title: def.title,
        description: def.description,
        inputSchema: def.input,
        annotations: { title: def.title, readOnlyHint: def.level === 'read', destructiveHint: def.level === 'full', openWorldHint: false },
      },
      // The SDK validates the arguments against `input` before calling this.
      (async (args: unknown) => {
        try {
          const result = await def.run(args as never, ctx);
          ctx.log.info({ tool: def.name, token: ctx.tokenName }, 'mcp tool');
          return { content: [{ type: 'text' as const, text: JSON.stringify(result ?? { ok: true }, roundNumbers) }] };
        } catch (err) {
          if (!(err instanceof HttpError)) ctx.log.error({ err, tool: def.name }, 'mcp tool failed');
          return { isError: true, content: [{ type: 'text' as const, text: errorText(err) }] };
        }
      }) as never,
    );
  }
  return server;
}
