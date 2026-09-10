import { describe, expect, it } from "vitest";
import { biClass, PRIORITY_CLASS, tertiles } from "./classify";

describe("classify", () => {
  it("labels the priority cell as highest need, lowest access", () => {
    expect(PRIORITY_CLASS).toBe("N3A1");
    expect(biClass(1, 3)).toBe("N1A3");
  });

  it("splits values into thirds", () => {
    expect(tertiles([1, 2, 3, 4, 5, 6, 7, 8, 9])).toEqual([
      1, 1, 1, 2, 2, 2, 3, 3, 3,
    ]);
  });
});
