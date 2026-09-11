import { describe, expect, it } from "vitest";
import {
  accessRank,
  accessWords,
  band,
  changeWords,
  clusteringWords,
  flag,
  needRank,
  placeLabel,
  verdict,
} from "./interpret";

describe("interpret", () => {
  it("bands percentile ranks so the bottom third always reads as poor", () => {
    expect(band(5)).toBe("very low");
    expect(band(30)).toBe("low");
    expect(band(33)).toBe("low");
    expect(band(50)).toBe("average");
    expect(band(80)).toBe("high");
    expect(band(95)).toBe("very high");
    expect(accessWords(12)).toBe("very poor access");
  });

  it("phrases percentile ranks from the reader's side", () => {
    expect(needRank(72)).toBe("more need than 72% of tracts");
    expect(needRank(20)).toBe("less need than 80% of tracts");
    expect(accessRank(12)).toBe("worse access than 88% of tracts");
    expect(accessRank(70)).toBe("better access than 70% of tracts");
    expect(accessRank(0)).toBe("the worst access of any tract");
    expect(needRank(100)).toBe("the most need of any tract");
  });

  it("labels places without repeating the county", () => {
    expect(placeLabel("Lithonia", "DeKalb")).toBe("Lithonia, DeKalb County");
    expect(placeLabel("Unincorporated DeKalb County", "DeKalb")).toBe("Unincorporated DeKalb County");
    expect(placeLabel(undefined, "Clayton")).toBe("Clayton County");
  });

  it("flags and verdicts follow the tertile grid", () => {
    expect(flag({ needTertile: 3, accessTertile: 1 })).toBe("Priority");
    expect(flag({ needTertile: 2, accessTertile: 1 })).toBe("Watch");
    expect(flag({ needTertile: 1, accessTertile: 3 })).toBe("Not flagged");
    expect(verdict({ needPct: 95, accessPct: 8, needTertile: 3, accessTertile: 1 })).toBe(
      "Priority: very high need and very poor access."
    );
    expect(verdict({ needPct: 55, accessPct: 12, needTertile: 2, accessTertile: 1 })).toBe(
      "Worth watching: very poor access, though need is average."
    );
    // A tract just inside the bottom third still reads as poor, never "typical".
    expect(verdict({ needPct: 90, accessPct: 32, needTertile: 3, accessTertile: 1 })).toBe(
      "Priority: very high need and poor access."
    );
  });

  it("describes changes and clustering in words", () => {
    expect(changeWords(0.06)).toBe("access slightly better");
    expect(changeWords(-0.3)).toBe("access worse");
    expect(changeWords(0.01)).toBe("access unchanged");
    expect(clusteringWords(0.42, 0)).toMatch(/strongly/);
    expect(clusteringWords(0.1, 0.4)).toMatch(/scattered/);
  });
});
