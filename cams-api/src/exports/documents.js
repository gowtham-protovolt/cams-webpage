import PDFDocument from "pdfkit";
import { strToU8, zipSync } from "fflate";

function escapeXml(value) {
  return String(value ?? "").replace(/[<>&'"]/g, character => ({
    "<": "&lt;",
    ">": "&gt;",
    "&": "&amp;",
    "'": "&apos;",
    '"': "&quot;"
  })[character]);
}

function columnName(index) {
  let name = "";
  for (let value = index + 1; value > 0; value = Math.floor((value - 1) / 26)) {
    name = String.fromCharCode(65 + ((value - 1) % 26)) + name;
  }
  return name;
}

function cellXml(value, reference, style = 0) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return `<c r="${reference}" s="${style}"><v>${value}</v></c>`;
  }
  return `<c r="${reference}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`;
}

export function createXlsx({ sheetName, columns, rows }) {
  const safeSheetName = String(sheetName || "CAMS Export").replace(/[\\/?*:[\]]/g, " ").slice(0, 31);
  const widths = columns.map(column => Math.min(Math.max(column.width || 14, 8), 40));
  const columnXml = widths.map((width, index) => `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`).join("");
  const header = `<row r="1">${columns.map((column, index) => cellXml(column.label, `${columnName(index)}1`, 1)).join("")}</row>`;
  const body = rows.map((row, rowIndex) => {
    const number = rowIndex + 2;
    return `<row r="${number}">${columns.map((column, columnIndex) => cellXml(row[column.key], `${columnName(columnIndex)}${number}`)).join("")}</row>`;
  }).join("");
  const lastCell = `${columnName(Math.max(columns.length - 1, 0))}${Math.max(rows.length + 1, 1)}`;
  const files = {
    "[Content_Types].xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`,
    "_rels/.rels": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    "xl/workbook.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${escapeXml(safeSheetName)}" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    "xl/_rels/workbook.xml.rels": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
    "xl/styles.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Aptos"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="11"/><name val="Aptos"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF0B5968"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/></cellXfs></styleSheet>`,
    "xl/worksheets/sheet1.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:${lastCell}"/><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${columnXml}</cols><sheetData>${header}${body}</sheetData><autoFilter ref="A1:${columnName(Math.max(columns.length - 1, 0))}${Math.max(rows.length + 1, 1)}"/></worksheet>`
  };
  return Buffer.from(zipSync(Object.fromEntries(Object.entries(files).map(([name, content]) => [name, strToU8(content)])), { level: 6 }));
}

export async function createPdf({ title, subtitle, columns, rows }) {
  const document = new PDFDocument({
    size: "A4",
    layout: "landscape",
    margin: 30,
    bufferPages: true,
    info: { Title: title, Author: "CAMS" }
  });
  const chunks = [];
  document.on("data", chunk => chunks.push(chunk));
  const finished = new Promise((resolve, reject) => {
    document.on("end", () => resolve(Buffer.concat(chunks)));
    document.on("error", reject);
  });

  const contentWidth = document.page.width - 60;
  const totalWeight = columns.reduce((sum, column) => sum + (column.width || 14), 0);
  const widths = columns.map(column => contentWidth * ((column.width || 14) / totalWeight));
  const headerHeight = 26;

  const drawTableHeader = y => {
    document.save().roundedRect(30, y, contentWidth, headerHeight, 3).fill("#0b5968").restore();
    let x = 30;
    columns.forEach((column, index) => {
      document.fillColor("#ffffff").font("Helvetica-Bold").fontSize(7.2)
        .text(column.label, x + 5, y + 8, { width: widths[index] - 10, lineBreak: false });
      x += widths[index];
    });
    return y + headerHeight;
  };

  const writeHeader = () => {
    document.fillColor("#0b5968").font("Helvetica-Bold").fontSize(19).text(title, 30, 28);
    document.fillColor("#667780").font("Helvetica").fontSize(8.5).text(subtitle, 30, 55, { width: contentWidth });
    return drawTableHeader(78);
  };

  let y = writeHeader();
  rows.forEach((row, rowIndex) => {
    const values = columns.map(column => String(row[column.key] ?? "-"));
    const heights = values.map((value, index) => document.font("Helvetica").fontSize(7.2).heightOfString(value, { width: widths[index] - 10 }));
    const rowHeight = Math.max(22, Math.max(...heights) + 10);
    if (y + rowHeight > document.page.height - 38) {
      document.addPage();
      y = writeHeader();
    }
    if (rowIndex % 2 === 0) document.save().rect(30, y, contentWidth, rowHeight).fill("#f3f7f8").restore();
    let x = 30;
    values.forEach((value, index) => {
      document.fillColor("#263f49").font("Helvetica").fontSize(7.2)
        .text(value, x + 5, y + 6, { width: widths[index] - 10, height: rowHeight - 8 });
      document.save().moveTo(x + widths[index], y).lineTo(x + widths[index], y + rowHeight).strokeColor("#d8e1e4").lineWidth(0.4).stroke().restore();
      x += widths[index];
    });
    document.save().moveTo(30, y + rowHeight).lineTo(30 + contentWidth, y + rowHeight).strokeColor("#d8e1e4").lineWidth(0.4).stroke().restore();
    y += rowHeight;
  });
  if (!rows.length) document.fillColor("#667780").font("Helvetica").fontSize(10).text("No records were available for this export.", 35, y + 15);

  const generatedAt = new Date().toISOString();
  const pages = document.bufferedPageRange();
  for (let index = pages.start; index < pages.start + pages.count; index += 1) {
    document.switchToPage(index);
    const footerY = document.page.height - 55;
    document.fillColor("#829199").font("Helvetica").fontSize(7)
      .text(`Generated by CAMS | ${generatedAt}`, 30, footerY, { width: contentWidth / 2, lineBreak: false })
      .text(`Page ${index - pages.start + 1} of ${pages.count}`, 30 + contentWidth / 2, footerY, { width: contentWidth / 2, align: "right", lineBreak: false });
  }
  document.end();
  return finished;
}
