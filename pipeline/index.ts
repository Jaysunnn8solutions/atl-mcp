/**
 * Runs every stage in order. Each stage caches its raw download, so a
 * re-run after a code change is fast; delete pipeline/cache to refetch.
 *
 *   npm run pipeline
 */

import { buildAcs } from "./acs";
import { assemble } from "./assemble";
import { log } from "./lib/http";
import { buildPois } from "./pois";
import { buildTracts } from "./tracts";
import { buildTransit } from "./transit";

async function main() {
  const started = Date.now();
  const tracts = await buildTracts();
  const [acs, pois, stops] = await Promise.all([
    buildAcs(),
    buildPois(tracts),
    buildTransit(),
  ]);
  assemble(tracts, acs, stops, { pois: pois.length, stops: stops.length });
  log(`done in ${((Date.now() - started) / 1000).toFixed(1)}s`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
