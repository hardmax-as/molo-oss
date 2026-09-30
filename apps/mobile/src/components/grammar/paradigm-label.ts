/**
 * The accessibility label for one paradigm row.
 *
 * React Native has no table element, so the structure a sighted learner
 * reads off the grid has to be said in words instead: "Class 1. Singular:
 * umntu. Plural: abantu." Without this a screen reader gets a heap of loose
 * forms with nothing tying them to their class, which is precisely the
 * information the paradigm exists to carry.
 *
 * A row's empty columns are left out rather than announced as blanks.
 */
export function paradigmRowLabel(input: {
  readonly rowHeader: string;
  readonly rowLabel: string;
  readonly columns: readonly string[];
  readonly cells: ReadonlyArray<{ readonly surfaceForm: string } | null>;
}): string {
  const parts = input.cells
    .map((c, i) => (c ? `${input.columns[i] ?? ""}: ${c.surfaceForm}` : null))
    .filter((x): x is string => x !== null);
  return [`${input.rowHeader} ${input.rowLabel}`.trim(), ...parts].join(". ");
}
