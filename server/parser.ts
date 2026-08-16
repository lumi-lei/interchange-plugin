import path from 'node:path';
import mammoth from 'mammoth';
import { createWorker } from 'tesseract.js';
import readSheet from 'read-excel-file/node';
import { convertWithMarkItDown } from './markitdown.js';

export type ParsedInput = {
  sourceType: string;
  filename: string;
  text: string;
  markdownFilename?: string;
};

const imageExts = new Set(['.png', '.jpg', '.jpeg', '.webp', '.bmp', '.gif']);
const excelExts = new Set(['.xlsx', '.xls', '.xlsm', '.csv']);
const textExts = new Set(['.txt', '.md', '.markdown', '.json', '.log']);
const markitdownSourceTypes = new Map<string, string>([
  ['.docx', 'word'],
  ['.pdf', 'pdf'],
  ['.xlsx', 'excel'],
  ['.xls', 'excel'],
  ['.xlsm', 'excel'],
  ['.csv', 'excel'],
  ['.html', 'markdown'],
  ['.htm', 'markdown'],
  ['.pptx', 'markdown'],
]);
const markitdownOnlyExts = new Set(['.html', '.htm', '.pptx']);

function isImageInput(file: Express.Multer.File, ext: string) {
  return imageExts.has(ext) || file.mimetype.startsWith('image/');
}

function isTextInput(file: Express.Multer.File, ext: string) {
  return textExts.has(ext) || (!markitdownSourceTypes.has(ext) && file.mimetype.startsWith('text/'));
}

function unsupportedFileType(file: Express.Multer.File, ext: string) {
  const error = new Error(`Unsupported file type: ${ext || file.mimetype}`);
  Object.assign(error, { status: 415 });
  return error;
}

function markdownFilenameFor(filename: string) {
  const parsed = path.parse(filename);
  const baseName = parsed.name || parsed.base || 'converted';
  return `${baseName}.md`;
}

export async function parseWithBuiltInParser(file: Express.Multer.File): Promise<ParsedInput> {
  const filename = file.originalname ?? 'upload';
  const ext = path.extname(filename).toLowerCase();

  if (ext === '.docx') {
    const result = await mammoth.extractRawText({ buffer: file.buffer });
    return { sourceType: 'word', filename, text: result.value.trim() };
  }

  if (ext === '.pdf') {
    const { PDFParse } = await import('pdf-parse');
    const parser = new PDFParse({ data: file.buffer });
    try {
      const result = await parser.getText();
      return { sourceType: 'pdf', filename, text: result.text.trim() };
    } finally {
      await parser.destroy();
    }
  }

  if (excelExts.has(ext)) {
    if (ext === '.csv') {
      return { sourceType: 'excel', filename, text: file.buffer.toString('utf8').trim() };
    }
    if (ext === '.xls') {
      const error = new Error('Legacy .xls files are not supported yet. Please save the spreadsheet as .xlsx or .csv.');
      Object.assign(error, { status: 415 });
      throw error;
    }
    const rows = await readSheet(file.buffer);
    const text = rows
      .map((row: unknown[]) => row.map((cell: unknown) => String(cell ?? '')).join(','))
      .join('\n');
    return { sourceType: 'excel', filename, text: text.trim() };
  }

  if (isTextInput(file, ext)) {
    return { sourceType: 'text', filename, text: file.buffer.toString('utf8') };
  }

  if (isImageInput(file, ext)) {
    const worker = await createWorker('eng+chi_sim');
    try {
      const result = await worker.recognize(file.buffer);
      return { sourceType: 'image', filename, text: result.data.text.trim() };
    } finally {
      await worker.terminate();
    }
  }

  throw unsupportedFileType(file, ext);
}

export async function parseUploadedFile(file: Express.Multer.File): Promise<ParsedInput> {
  const filename = file.originalname ?? 'upload';
  const ext = path.extname(filename).toLowerCase();

  if (isTextInput(file, ext) || isImageInput(file, ext)) {
    return parseWithBuiltInParser(file);
  }

  const markitdownSourceType = markitdownSourceTypes.get(ext);
  if (markitdownSourceType) {
    const result = await convertWithMarkItDown(file);
    let markitdownFailureMessage = '';
    if (result.ok) {
      const text = result.text.trim();
      if (text) {
        return {
          sourceType: markitdownSourceType,
          filename,
          text,
          markdownFilename: markdownFilenameFor(filename),
        };
      }
      markitdownFailureMessage = 'MarkItDown returned empty output.';
    } else {
      markitdownFailureMessage = result.message;
    }

    if (markitdownOnlyExts.has(ext)) {
      const error = new Error(`Unable to parse ${ext} with MarkItDown: ${markitdownFailureMessage}`);
      Object.assign(error, { status: 415 });
      throw error;
    }
  }

  return parseWithBuiltInParser(file);
}
