import {PDFDocument, degrees} from 'pdf-lib';

export function safeWebLink(text) {
  try {
    const url = new URL(text);
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}

export function splitBounds(width, height, fraction = .5) {
  if (!Number.isFinite(fraction) || fraction < .1 || fraction > .9) throw new Error('Invalid book split.');
  const middle = Math.round(width * fraction);
  return [[0, 0, middle, height], [middle, 0, width - middle, height]];
}

export function signaturePlacement(viewport, box) {
  const [x, y] = viewport.convertToPdfPoint(box.x, box.y + box.height);
  const [rightX, rightY] = viewport.convertToPdfPoint(box.x + box.width, box.y + box.height);
  const [topX, topY] = viewport.convertToPdfPoint(box.x, box.y);
  return {x, y, width: Math.hypot(rightX - x, rightY - y), height: Math.hypot(topX - x, topY - y), rotate: degrees(Math.atan2(rightY - y, rightX - x) * 180 / Math.PI)};
}

export async function scanPDF(images, mode, layout = 'Stacked') {
  if (!images.length || images.length > 60) throw new Error('Choose between 1 and 60 pages.');
  if (mode === 'scan_id' && images.length !== 2) throw new Error('An ID scan needs exactly two sides: front and back.');
  const pdf = await PDFDocument.create();
  const idPage = mode === 'scan_id' ? pdf.addPage([595.28, 841.89]) : null;
  for (const [index, bytes] of images.entries()) {
    const image = bytes[0] === 0xff ? await pdf.embedJpg(bytes) : await pdf.embedPng(bytes);
    const page = idPage || pdf.addPage([595.28, 841.89]);
    const sideBySide = layout === 'Side by side';
    const width = idPage ? (sideBySide ? 250 : 300) : 547.28;
    const height = idPage ? 200 : 793.89;
    const scale = Math.min(width / image.width, height / image.height);
    const w = image.width * scale, h = image.height * scale;
    const centerX = idPage && sideBySide ? (index === 0 ? 156 : 439) : page.getWidth() / 2;
    const centerY = idPage ? (sideBySide ? 421 : index === 0 ? 560 : 280) : page.getHeight() / 2;
    page.drawImage(image, {x: centerX - w / 2, y: centerY - h / 2, width: w, height: h});
  }
  return pdf.save();
}

export async function reorderPDF(bytes, order) {
  const pdf = await PDFDocument.load(bytes);
  const pages = pdf.getPages();
  if (!order.length) throw new Error('Keep at least one page.');
  const seen = new Set();
  for (const item of order) {
    if (!Number.isInteger(item.index) || item.index < 0 || item.index >= pages.length || seen.has(item.index)) throw new Error('Invalid page order.');
    if (!Number.isFinite(item.rotation) || item.rotation % 90) throw new Error('Invalid rotation.');
    seen.add(item.index);
  }
  // Keep page objects in their original document so text and annotations are not rasterized.
  for (let index = pages.length - 1; index >= 0; index--) pdf.removePage(index);
  for (const item of order) {
    const page = pages[item.index];
    page.setRotation(degrees((page.getRotation().angle + item.rotation) % 360));
    pdf.addPage(page);
  }
  return pdf.save();
}

export async function signPDF(bytes, pageIndex, signature, placement) {
  const pdf = await PDFDocument.load(bytes);
  const page = pdf.getPages()[pageIndex];
  if (!page) throw new Error('Choose a valid page.');
  const image = await pdf.embedPng(signature);
  page.drawImage(image, placement);
  return pdf.save();
}
