function cell(value: string): string {
  const safe = /^[=+@\t]/.test(value) ? `'${value}` : value;
  if (/[",\n\r]/.test(safe)) return `"${safe.replaceAll('"', '""')}"`;
  return safe;
}

export function toCsv(headers: string[], rows: string[][]): string {
  const lines = [headers, ...rows].map((row) => row.map(cell).join(","));
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}
