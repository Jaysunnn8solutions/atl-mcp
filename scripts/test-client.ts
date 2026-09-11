/**
 * Smoke test against a running server. Exercises every tool once, plus
 * prompts and resources, and prints the first lines of each answer.
 *
 *   npm run test:client -- http://localhost:3000
 */
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";

const origin = process.argv.slice(2).find((a) => a !== "--") ?? "http://localhost:3000";
const PREVIEW_LINES = 6;

async function main() {
  const client = new Client({ name: "atl-mcp-smoke", version: "0.2.0" });
  const endpoint = new URL("/mcp", `${origin}/`);
  await client.connect(new StreamableHTTPClientTransport(endpoint));
  console.log("Connected to", endpoint.toString());

  const { tools } = await client.listTools();
  console.log(`Tools (${tools.length}):`, tools.map((t) => t.name).join(", "));
  const { prompts } = await client.listPrompts();
  console.log(`Prompts (${prompts.length}):`, prompts.map((p) => p.name).join(", "));
  const { resources } = await client.listResources();
  console.log(`Resources (${resources.length}):`, resources.map((r) => r.uri).join(", "));

  const calls: Array<[string, Record<string, unknown>]> = [
    ["describe_analysis", {}],
    ["load_view", { link: "https://atl-mcp.vercel.app/#mode=delta&r=0.8&sel=13121007805&scn=clinic@33.72,-84.45" }],
    ["find_priority_tracts", { limit: 3, priorityOnly: true }],
    ["get_tract", { geoid: "13121007805" }],
    ["tracts_near", { station: "Five Points", withinKm: 1.5, limit: 3 }],
    ["search_place", { query: "Bankhead", withinKm: 1.5, limit: 3 }],
    ["compare_counties", {}],
    ["find_similar", { geoid: "13121007805", k: 3, minAccessAdvantage: 1 }],
    ["coverage_gaps", { domain: "clinic", limit: 3 }],
    ["site_selection", { domain: "clinic", k: 2 }],
    [
      "what_if",
      { add: [{ domain: "clinic", lon: -84.45, lat: 33.72, label: "Test clinic" }], limit: 3 },
    ],
    ["plan_visit", { limit: 5, startStation: "Five Points" }],
    ["plan_budget", { budget: 100_000_000 }],
  ];

  let failures = 0;
  for (const [name, args] of calls) {
    const started = Date.now();
    const result = (await client.callTool({ name, arguments: args })) as {
      isError?: boolean;
      content?: Array<{ type: string; text?: string }>;
    };
    const ms = Date.now() - started;
    const body = result.content?.find((c) => c.type === "text")?.text ?? JSON.stringify(result);
    const status = result.isError ? "ERROR" : "ok";
    if (result.isError) failures++;
    console.log(`\n=== ${name} (${status}, ${ms} ms) ===`);
    console.log(body.split("\n").slice(0, PREVIEW_LINES).join("\n"));
  }

  const prompt = await client.getPrompt({ name: "brief_tract", arguments: { geoid: "13121007805" } });
  console.log(`\n=== prompt brief_tract ===\n${String(prompt.messages[0]?.content && "text" in prompt.messages[0].content ? prompt.messages[0].content.text : "").split("\n").slice(0, 3).join("\n")}`);

  const method = await client.readResource({ uri: "atl://method" });
  console.log(`\n=== resource atl://method ===\n${String(method.contents[0] && "text" in method.contents[0] ? method.contents[0].text : "").split("\n").slice(0, 3).join("\n")}`);

  await client.close();
  if (failures > 0) {
    console.error(`\n${failures} tool call(s) returned isError`);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
