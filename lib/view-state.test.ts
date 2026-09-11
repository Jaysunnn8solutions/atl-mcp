import { describe, expect, it } from "vitest";
import {
  DEFAULT_VIEW,
  hashFromInput,
  parseViewHash,
  serializeViewHash,
  viewToToolArgs,
} from "./view-state";

describe("view state hash", () => {
  it("serializes the default view to an empty hash and parses it back", () => {
    expect(serializeViewHash(DEFAULT_VIEW)).toBe("");
    expect(parseViewHash("")).toEqual(DEFAULT_VIEW);
  });

  it("round-trips a full view", () => {
    const view = {
      ...DEFAULT_VIEW,
      mode: "delta" as const,
      params: { ...DEFAULT_VIEW.params, radiusKm: 0.8, decay: "binary" as const, wGrowth: 2 },
      showPriority: false,
      overlays: { rail: false, grocery: true, pharmacy: false, clinic: true },
      selected: "13121007805",
      scenario: [
        { domain: "clinic" as const, lat: 33.72, lon: -84.45 },
        { domain: "transit" as const, lat: 33.6, lon: -84.4 },
      ],
      coverageDomain: "transit" as const,
      minTph: 8,
    };
    const hash = serializeViewHash(view);
    expect(hash).toContain("scn=clinic@33.72000,-84.45000|transit@33.60000,-84.40000");
    expect(parseViewHash(hash)).toEqual(view);
  });

  it("ignores malformed or out-of-range values", () => {
    const v = parseViewHash("mode=bogus&r=99&w=1,2&sel=abc&scn=grocery@nope");
    expect(v.mode).toBe("gap");
    expect(v.params.radiusKm).toBe(1.6);
    expect(v.params.wPoverty).toBe(1);
    expect(v.selected).toBeNull();
    expect(v.scenario).toEqual([]);
  });

  it("extracts the hash from a full link", () => {
    expect(hashFromInput("https://atl-mcp.vercel.app/#mode=need&r=2")).toBe("mode=need&r=2");
    expect(hashFromInput("#r=2")).toBe("r=2");
    expect(hashFromInput("r=2")).toBe("r=2");
    expect(hashFromInput("https://atl-mcp.vercel.app/")).toBe("");
  });

  it("produces tool arguments with the same names the tools accept", () => {
    const args = viewToToolArgs(parseViewHash("r=0.8&scn=clinic@33.72,-84.45"));
    expect(args).toEqual({
      radiusKm: 0.8,
      decay: "gaussian",
      wPoverty: 1,
      wNoVehicle: 1,
      wSeniors: 0.5,
      wChildren: 0.5,
      wGrowth: 1,
      add: [{ domain: "clinic", lon: -84.45, lat: 33.72 }],
    });
  });
});
