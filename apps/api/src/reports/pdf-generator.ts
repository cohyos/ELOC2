/**
 * PDF generator for ELOC2 scenario reports.
 * Converts markdown report content to a PDF document using pdfmake.
 */

import type { TDocumentDefinitions, Content, ContentText } from 'pdfmake/interfaces';
import { createRequire } from 'module';
import path from 'path';
import fs from 'fs';

// Use createRequire to load pdfmake via CJS — avoids ESM resolution issues
const require = createRequire(import.meta.url);
const pdfmake = require('pdfmake');

// Register font files into pdfmake's virtual filesystem
const pdfmakePath = path.dirname(require.resolve('pdfmake/package.json'));
const fontsDir = path.join(pdfmakePath, 'build', 'fonts', 'Roboto');

const fontFiles = {
  'Roboto-Regular.ttf': path.join(fontsDir, 'Roboto-Regular.ttf'),
  'Roboto-Medium.ttf': path.join(fontsDir, 'Roboto-Medium.ttf'),
  'Roboto-Italic.ttf': path.join(fontsDir, 'Roboto-Italic.ttf'),
  'Roboto-MediumItalic.ttf': path.join(fontsDir, 'Roboto-MediumItalic.ttf'),
};

// Load font buffers into virtualfs
for (const [name, filePath] of Object.entries(fontFiles)) {
  try {
    pdfmake.virtualfs.storage[name] = fs.readFileSync(filePath);
  } catch {
    // Font file not found — PDF generation will fail gracefully at runtime
  }
}

// Register font definitions
pdfmake.setFonts({
  Roboto: {
    normal: 'Roboto-Regular.ttf',
    bold: 'Roboto-Medium.ttf',
    italics: 'Roboto-Italic.ttf',
    bolditalics: 'Roboto-MediumItalic.ttf',
  },
});

// Suppress URL access policy warning in server context
pdfmake.setUrlAccessPolicy(() => false);

/**
 * Convert markdown-formatted report content to a PDF buffer.
 * Simple markdown parsing: handles headers (#, ##, ###), bold (**), lists (-), and tables.
 */
export async function markdownToPdf(markdown: string): Promise<Buffer> {
  const content: Content[] = [];
  const lines = markdown.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Skip empty lines
    if (line.trim() === '') continue;

    // Horizontal rules
    if (line.match(/^-{3,}$/) || line.match(/^={3,}$/)) {
      content.push({ canvas: [{ type: 'line', x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 0.5, lineColor: '#cccccc' }], margin: [0, 5, 0, 5] } as any);
      continue;
    }

    // Headers
    if (line.startsWith('# ')) {
      content.push({ text: line.slice(2), style: 'h1', margin: [0, 10, 0, 5] } as ContentText);
      continue;
    }
    if (line.startsWith('## ')) {
      content.push({ text: line.slice(3), style: 'h2', margin: [0, 8, 0, 4] } as ContentText);
      continue;
    }
    if (line.startsWith('### ')) {
      content.push({ text: line.slice(4), style: 'h3', margin: [0, 6, 0, 3] } as ContentText);
      continue;
    }

    // List items
    if (line.match(/^\s*[-*] /)) {
      const text = line.replace(/^\s*[-*] /, '');
      content.push({ text: `\u2022 ${cleanMarkdown(text)}`, margin: [10, 1, 0, 1], fontSize: 10 } as ContentText);
      continue;
    }

    // Table rows (detect markdown tables)
    if (line.includes('|') && line.trim().startsWith('|')) {
      // Collect table rows
      const tableRows: string[][] = [];
      let j = i;
      while (j < lines.length && lines[j].includes('|') && lines[j].trim().startsWith('|')) {
        const cells = lines[j].split('|').filter(c => c.trim() !== '');
        // Skip separator rows (----)
        if (!cells[0]?.match(/^[\s-:]+$/)) {
          tableRows.push(cells.map(c => cleanMarkdown(c.trim())));
        }
        j++;
      }
      i = j - 1; // advance

      if (tableRows.length > 0) {
        const widths = tableRows[0].map(() => '*');
        content.push({
          table: {
            headerRows: 1,
            widths,
            body: tableRows.map((row, idx) =>
              row.map(cell => ({
                text: cell,
                fontSize: 9,
                bold: idx === 0,
                color: idx === 0 ? '#333333' : '#555555',
              }))
            ),
          },
          layout: 'lightHorizontalLines',
          margin: [0, 4, 0, 4],
        } as any);
      }
      continue;
    }

    // Regular paragraph
    content.push({ text: cleanMarkdown(line), fontSize: 10, margin: [0, 1, 0, 1] } as ContentText);
  }

  const docDefinition: TDocumentDefinitions = {
    content,
    defaultStyle: {
      font: 'Roboto',
      fontSize: 10,
      lineHeight: 1.3,
    },
    styles: {
      h1: { fontSize: 18, bold: true, color: '#1a1a2e' },
      h2: { fontSize: 14, bold: true, color: '#2a2a4e' },
      h3: { fontSize: 12, bold: true, color: '#333366' },
    },
    pageSize: 'A4',
    pageMargins: [40, 40, 40, 40],
    header: {
      text: 'ELOC2 — EO C2 Air Defense Demonstrator Report',
      fontSize: 8,
      color: '#999999',
      margin: [40, 20, 40, 0],
    },
    footer: (currentPage: number, pageCount: number) => ({
      text: `Page ${currentPage} of ${pageCount}`,
      fontSize: 8,
      color: '#999999',
      alignment: 'center',
      margin: [0, 10, 0, 0],
    }),
  };

  const pdfDoc = pdfmake.createPdf(docDefinition);
  const buffer = await pdfDoc.getBuffer();
  return Buffer.from(buffer);
}

/** Strip markdown formatting (bold, italic, code) from text. */
function cleanMarkdown(text: string): string {
  return text
    .replace(/\*\*([^*]+)\*\*/g, '$1')  // bold
    .replace(/\*([^*]+)\*/g, '$1')       // italic
    .replace(/`([^`]+)`/g, '$1')         // inline code
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1'); // links
}
