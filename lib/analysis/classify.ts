import { tertile } from "../spatial/stats";

/**
 * Bivariate class label from two tertiles: "N3A1" is highest-need third,
 * lowest-access third — the priority cell.
 */
export function biClass(needT: 1 | 2 | 3, accessT: 1 | 2 | 3): string {
  return `N${needT}A${accessT}`;
}

export const PRIORITY_CLASS = biClass(3, 1);

export function tertiles(values: number[]): Array<1 | 2 | 3> {
  const sorted = [...values].sort((a, b) => a - b);
  return values.map((v) => tertile(v, sorted));
}
