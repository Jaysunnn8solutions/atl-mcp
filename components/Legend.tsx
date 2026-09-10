"use client";

import { binsFor, NO_DATA_COLOR, type Mode } from "./scales";
import styles from "./Legend.module.css";

export function Legend({ mode, showPriority }: { mode: Mode; showPriority: boolean }) {
  const bins = binsFor(mode);
  return (
    <div className={styles.legend} aria-label="Map legend">
      {bins.map((b) => (
        <div key={b.label} className={styles.row}>
          <span className={styles.swatch} style={{ background: b.color }} />
          <span>{b.label}</span>
        </div>
      ))}
      {mode === "growth" && (
        <div className={styles.row}>
          <span className={styles.swatch} style={{ background: NO_DATA_COLOR }} />
          <span>no prior-vintage match</span>
        </div>
      )}
      {showPriority && mode !== "coverage" && (
        <div className={styles.row}>
          <span className={`${styles.swatch} ${styles.outline}`} />
          <span>priority cell: top-third need, bottom-third access</span>
        </div>
      )}
    </div>
  );
}
