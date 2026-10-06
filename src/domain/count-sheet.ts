import type { ComponentStatus } from "./constants";
import { classifyComponent, summarize, type CountSummary } from "./traffic-light";
import { countSchema, parseWholeNumber } from "./validation";

/** One component on the verifier's count sheet, as the server describes it. */
export interface SheetComponent {
  componentId: number;
  componentName: string;
  expectedQty: number;
}

/** What is typed in one count box: a count, nothing yet, or text that is not a count. */
export type CountCheck =
  | { kind: "count"; value: number }
  | { kind: "empty" }
  | { kind: "invalid"; error: string };

export interface SheetRow extends SheetComponent {
  check: CountCheck;
  /** The count as the server would store it: null while the box is empty or invalid. */
  actualQty: number | null;
  variance: number | null;
  status: ComponentStatus;
}

export interface SheetPreview {
  rows: SheetRow[];
  /** Totals, the approval decision and the blocker list, exactly as the server computes them. */
  summary: CountSummary;
}

/**
 * A count box, checked with the API's own parser and schema (PLAN §5.7). Empty means not counted
 * and is never read as 0 (D17); "12abc", "2.5" or "-1" are errors, never silently fixed.
 */
export function checkCount(raw: string): CountCheck {
  const parsed = parseWholeNumber(raw);
  if (parsed.kind === "empty") {
    return { kind: "empty" };
  }
  const result = countSchema.safeParse(parsed.kind === "number" ? parsed.value : "not a number");
  return result.success
    ? { kind: "count", value: result.data }
    : { kind: "invalid", error: result.error.issues[0].message };
}

/**
 * The verifier terminal's live view (PLAN §8.2). Every keystroke reclassifies its row with the
 * rule the server applies on approve, so the screen and a 422 can never disagree.
 * An invalid box counts as not counted, so it blocks approval too.
 */
export function previewSheet(
  components: readonly SheetComponent[],
  drafts: Readonly<Record<number, string>>,
): SheetPreview {
  const rows = components.map((component): SheetRow => {
    const check = checkCount(drafts[component.componentId] ?? "");
    const actualQty = check.kind === "count" ? check.value : null;
    return {
      componentId: component.componentId,
      componentName: component.componentName,
      expectedQty: component.expectedQty,
      check,
      actualQty,
      variance: actualQty === null ? null : actualQty - component.expectedQty,
      status: classifyComponent(component.expectedQty, actualQty),
    };
  });
  return { rows, summary: summarize(rows) };
}

/** The complete sheet Approve sends, or null while any component lacks a valid count (PLAN §5.5). */
export function completeSheet(
  rows: readonly SheetRow[],
): { componentId: number; actualQty: number }[] | null {
  const entries = rows.flatMap((row) =>
    row.actualQty === null ? [] : [{ componentId: row.componentId, actualQty: row.actualQty }],
  );
  return entries.length === rows.length ? entries : null;
}

/** Every valid box, empty ones as null, for Reject. Invalid text is left out rather than guessed. */
export function partialSheet(rows: readonly SheetRow[]): { componentId: number; actualQty: number | null }[] {
  return rows
    .filter((row) => row.check.kind !== "invalid")
    .map((row) => ({ componentId: row.componentId, actualQty: row.actualQty }));
}

/**
 * The reject reason pre-filled from the shortages (PLAN §8.2), e.g.
 * "Shortage: Sleeve Cuffs 96/100 (−4)." Empty when nothing is short.
 */
export function describeShortages(rows: readonly SheetRow[]): string {
  const shortages = rows.flatMap((row) =>
    row.status === "RED" && row.actualQty !== null
      ? [`${row.componentName} ${row.actualQty}/${row.expectedQty} (−${row.expectedQty - row.actualQty})`]
      : [],
  );
  return shortages.length === 0 ? "" : `Shortage: ${shortages.join("; ")}.`;
}
