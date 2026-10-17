/** Seam for the spreadsheet workbook (section 18.9). Not implemented in this version. */
export const workbookImport = {
  id: "xlsx-workbook",
  available: false as const,
  reason: "Workbook import is deferred. Record bills going forward, or use CSV and the sample JSON plugin.",
};

export const workbookExport = {
  id: "xlsx-workbook",
  available: false as const,
  reason: "Color-band spreadsheet export is deferred. The year matrix exports as CSV.",
};
