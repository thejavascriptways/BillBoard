export const PROPERTY_COLORS = [
  "#7b2fe0",
  "#c2412f",
  "#3a1f8f",
  "#6d28d9",
  "#9a3412",
  "#4c1d95",
];

export function propertyColor(index: number): string {
  return PROPERTY_COLORS[index % PROPERTY_COLORS.length] ?? PROPERTY_COLORS[0];
}
