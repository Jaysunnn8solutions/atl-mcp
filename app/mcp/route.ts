import { createMcpHandler } from "mcp-handler";
import {
  compareCountiesConfig,
  compareCountiesHandler,
} from "@/lib/tools/compare-counties";
import { coverageGapsConfig, coverageGapsHandler } from "@/lib/tools/coverage-gaps";
import {
  describeAnalysisConfig,
  describeAnalysisHandler,
} from "@/lib/tools/describe-analysis";
import {
  findPriorityTractsConfig,
  findPriorityTractsHandler,
} from "@/lib/tools/find-priority-tracts";
import { findSimilarConfig, findSimilarHandler } from "@/lib/tools/find-similar";
import { getTractConfig, getTractHandler } from "@/lib/tools/get-tract";
import { loadViewConfig, loadViewHandler } from "@/lib/tools/load-view";
import { planVisitConfig, planVisitHandler } from "@/lib/tools/plan-visit";
import { briefTractPrompt, compareCountiesPrompt, sitePlanPrompt } from "@/lib/tools/prompts";
import { manifestResource, methodResource } from "@/lib/tools/resources";
import { searchPlaceConfig, searchPlaceHandler } from "@/lib/tools/search-place";
import { siteSelectionConfig, siteSelectionHandler } from "@/lib/tools/site-selection";
import { tractsNearConfig, tractsNearHandler } from "@/lib/tools/tracts-near";
import { whatIfConfig, whatIfHandler } from "@/lib/tools/what-if";

/**
 * The same analysis the map renders, exposed as MCP tools. Tools compute on
 * request from the committed data, so a model can vary the parameters and
 * test scenarios. Prompts package multi-tool workflows; resources expose
 * the manifest and method for context.
 */
const handler = createMcpHandler(
  (server) => {
    // Orientation
    server.registerTool("describe_analysis", describeAnalysisConfig, describeAnalysisHandler);
    server.registerTool("load_view", loadViewConfig, loadViewHandler);

    // Lookup
    server.registerTool("find_priority_tracts", findPriorityTractsConfig, findPriorityTractsHandler);
    server.registerTool("get_tract", getTractConfig, getTractHandler);
    server.registerTool("tracts_near", tractsNearConfig, tractsNearHandler);
    server.registerTool("search_place", searchPlaceConfig, searchPlaceHandler);
    server.registerTool("compare_counties", compareCountiesConfig, compareCountiesHandler);

    // Comparison and coverage
    server.registerTool("find_similar", findSimilarConfig, findSimilarHandler);
    server.registerTool("coverage_gaps", coverageGapsConfig, coverageGapsHandler);

    // Location allocation and scenarios
    server.registerTool("site_selection", siteSelectionConfig, siteSelectionHandler);
    server.registerTool("what_if", whatIfConfig, whatIfHandler);
    server.registerTool("plan_visit", planVisitConfig, planVisitHandler);

    // Prompts and resources
    server.registerPrompt(briefTractPrompt.name, briefTractPrompt.config, briefTractPrompt.handler);
    server.registerPrompt(compareCountiesPrompt.name, compareCountiesPrompt.config, compareCountiesPrompt.handler);
    server.registerPrompt(sitePlanPrompt.name, sitePlanPrompt.config, sitePlanPrompt.handler);
    server.registerResource(manifestResource.name, manifestResource.uri, manifestResource.config, manifestResource.handler);
    server.registerResource(methodResource.name, methodResource.uri, methodResource.config, methodResource.handler);
  },
  {
    serverInfo: { name: "atl-mcp", version: "0.2.0" },
  }
);

export { handler as GET, handler as POST };
