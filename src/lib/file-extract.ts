/**
 * Real client-side ingestion: turns an uploaded vendor file into text (or an
 * image data URL for scanned documents) that the extraction model can read.
 * Nothing here guesses commercial values, it only recovers the raw content.
 */

export type SourceKind = "XLSX" | "CSV" | "PDF" | "DOCX" | "IMAGE" | "EMAIL" | "TEXT";

export type IngestedFile = {
  name: string;
  kind: SourceKind;
  /** Plain-text rendering of the document, or "" when only an image is available. */
  text: string;
  /** Present for photographed / scanned documents, read by the vision model. */
  imageDataUrl?: string;
  note: string;
};

function ext(name: string) {
  return name.split(".").pop()?.toLowerCase() ?? "";
}

async function readDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result));
    fr.onerror = () => reject(new Error(`Could not read ${file.name}`));
    fr.readAsDataURL(file);
  });
}

async function fromSpreadsheet(file: File): Promise<string> {
  const XLSX = await import("xlsx");
  const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
  return wb.SheetNames.map((n) => {
    const sheet = wb.Sheets[n];
    if (!sheet) return "";
    return `--- SHEET: ${n} ---\n${XLSX.utils.sheet_to_csv(sheet)}`;
  })
    .join("\n\n")
    .trim();
}

async function fromDocx(file: File): Promise<string> {
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const doc = zip.file("word/document.xml");
  if (!doc) throw new Error(`${file.name} is not a readable Word document`);
  const xml = await doc.async("string");
  return xml
    .replace(/<w:tab[^>]*\/>/g, "\t")
    .replace(/<\/w:p>/g, "\n")
    .replace(/<\/w:tr>/g, "\n")
    .replace(/<\/w:tc>/g, " | ")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function fromPdf(file: File): Promise<{ text: string; imageDataUrl?: string }> {
  const pdfjs = await import("pdfjs-dist");
  const workerUrl = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

  const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  const pages: string[] = [];
  for (let p = 1; p <= Math.min(pdf.numPages, 15); p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    const text = content.items
      .map((i) => ("str" in i ? i.str : ""))
      .join(" ")
      .replace(/\s{2,}/g, " ")
      .trim();
    pages.push(`--- PAGE ${p} ---\n${text}`);
  }
  const joined = pages.join("\n\n").trim();
  const hasText = joined.replace(/--- PAGE \d+ ---/g, "").trim().length > 40;
  if (hasText) return { text: joined };

  // Scanned PDF: rasterise page 1 so the vision model can read it.
  const page = await pdf.getPage(1);
  const viewport = page.getViewport({ scale: 2 });
  const canvas = document.createElement("canvas");
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const ctx = canvas.getContext("2d")!;
  await page.render({ canvas, canvasContext: ctx, viewport }).promise;
  return { text: "", imageDataUrl: canvas.toDataURL("image/jpeg", 0.85) };
}

export async function ingestFile(file: File): Promise<IngestedFile> {
  const e = ext(file.name);

  if (e === "xlsx" || e === "xls") {
    return { name: file.name, kind: "XLSX", text: await fromSpreadsheet(file), note: "Workbook sheets flattened to CSV" };
  }
  if (e === "csv") {
    return { name: file.name, kind: "CSV", text: await file.text(), note: "Read as delimited text" };
  }
  if (e === "docx" || e === "doc") {
    return { name: file.name, kind: "DOCX", text: await fromDocx(file), note: "Word body text and tables extracted" };
  }
  if (e === "pdf") {
    const r = await fromPdf(file);
    return {
      name: file.name,
      kind: "PDF",
      text: r.text,
      ...(r.imageDataUrl ? { imageDataUrl: r.imageDataUrl } : {}),
      note: r.imageDataUrl ? "No text layer, page 1 sent for visual reading" : "PDF text layer extracted",
    };
  }
  if (["png", "jpg", "jpeg", "webp"].includes(e)) {
    return {
      name: file.name,
      kind: "IMAGE",
      text: "",
      imageDataUrl: await readDataUrl(file),
      note: "Photographed document, read visually",
    };
  }
  return { name: file.name, kind: "TEXT", text: await file.text(), note: "Read as plain text" };
}
