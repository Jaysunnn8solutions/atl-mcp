import { createMcpHandler } from "mcp-handler";
import {
  compareCountiesConfig,
  compareCountiesHandler,
} from "@/lib/tools/compare-counties";
import {
  describeAnalysisConfig,
  describeAnalysisHandler,
} from "@/lib/tools/describe-analysis";
import {
  findPriorityTractsConfig,
  findPriorityTractsHandler,
} from "@/lib/tools/find-priority-tracts";
import { getTractConfig, getTractHandler } from "@/lib/tools/get-tract";
import { tractsNearConfig, tractsNearHandler } from "@/lib/tools/tracts-near";

/**
 * The same analysis the map renders, exposed as MCP tools. Tools compute on
 * request from the committed data, so a model can vary the parameters.
 */
const handler = createMcpHandler(
  (server) => {
    server.registerTool("describe_analysis", describeAnalysisConfig, describeAnalysisHandler);
    server.registerTool(
      "find_priority_tracts",
      findPriorityTractsConfig,
      findPriorityTractsHandler
    );
    server.registerTool("get_tract", getTractConfig, getTractHandler);
    server.registerTool("tracts_near", tractsNearConfig, tractsNearHandler);
    server.registerTool("compare_counties", compareCountiesConfig, compareCountiesHandler);
  },
  {
    serverInfo: { name: "atl-mcp", version: "0.1.0" },
  }
);

export { handler as GET, handler as POST };
