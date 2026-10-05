import test from "node:test";
import assert from "node:assert/strict";
import { strFromU8, unzipSync } from "fflate";
import { createPdf, createXlsx } from "../src/exports/documents.js";

const columns = [
  { key: "machine", label: "Machine", width: 14 },
  { key: "pressure", label: "Pressure (bar)", width: 16 }
];
const rows = [{ machine: "CAMS-01", pressure: 7.2 }];

test("creates a standards-based XLSX workbook", () => {
  const workbook = createXlsx({ sheetName: "Telemetry", columns, rows });
  assert.equal(workbook.subarray(0, 2).toString(), "PK");
  const files = unzipSync(workbook);
  assert.ok(files["xl/workbook.xml"]);
  assert.ok(files["xl/worksheets/sheet1.xml"]);
  const sheet = strFromU8(files["xl/worksheets/sheet1.xml"]);
  assert.match(sheet, /CAMS-01/);
  assert.match(sheet, /<v>7.2<\/v>/);
});

test("creates a readable PDF document", async () => {
  const pdf = await createPdf({ title: "CAMS Telemetry", subtitle: "Local test", columns, rows });
  assert.equal(pdf.subarray(0, 5).toString(), "%PDF-");
  assert.ok(pdf.length > 1000);
});
