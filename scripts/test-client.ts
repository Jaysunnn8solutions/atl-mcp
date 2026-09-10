/**
 * Smoke test against a running server:
 *   npm run test:client -- http://localhost:3000
 */
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";

const origin = process.argv.slice(2).find((a) => a !== "--") ?? "http://localhost:3000";

async function main() {
  const client = new Client({ name: "atl-mcp-smoke", version: "0.1.0" });
  const endpoint = new URL("/mcp", `${origin}/`);
  await client.connect(new StreamableHTTPClientTransport(endpoint));
  console.log("Connected to", endpoint.toString());

  const { tools } = await client.listTools();
  console.log("Tools:", tools.map((t) => t.name).join(", "));

  const describe = await client.callTool({ name: "describe_analysis", arguments: {} });
  console.log(firstText(describe));

  const top = await client.callTool({
    name: "find_priority_tracts",
    arguments: { limit: 5, priorityOnly: true },
  });
  console.log(firstText(top));

  const near = await client.callTool({
    name: "tracts_near",
    arguments: { station: "Five Points", withinKm: 2, limit: 5 },
  });
  console.log(firstText(near));

  await client.close();
}

function firstText(result: unknown): string {
  const content = (result as { content?: Array<{ type: string; text?: string }> }).content;
  return content?.find((c) => c.type === "text")?.text ?? JSON.stringify(result);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
