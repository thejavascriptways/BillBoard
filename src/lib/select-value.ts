/**
 * A required select with no blank choice still displays its first option when
 * the value is empty. Return that option so a save uses the id on screen.
 * Returns null when the current value should be left alone.
 */
export function committedOption(value: string, options: string[], allowEmpty: boolean): string | null {
  if (allowEmpty) return null;
  if (options.includes(value)) return null;
  return options[0] ?? null;
}
