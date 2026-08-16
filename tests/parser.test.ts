import { beforeEach, describe, expect, it, vi } from 'vitest';
import { parseUploadedFile } from '../server/parser.js';

const { mocks } = vi.hoisted(() => {
  const pdfGetText = vi.fn();
  const pdfDestroy = vi.fn();
  const recognize = vi.fn();
  const terminate = vi.fn();

  return {
    mocks: {
      convertWithMarkItDown: vi.fn(),
      extractRawText: vi.fn(),
      readSheet: vi.fn(),
      pdfGetText,
      pdfDestroy,
      PDFParse: vi.fn(function PDFParse() {
        return {
          getText: pdfGetText,
          destroy: pdfDestroy,
        };
      }),
      recognize,
      terminate,
      createWorker: vi.fn().mockResolvedValue({
        recognize,
        terminate,
      }),
    },
  };
});

vi.mock('../server/markitdown.js', () => ({
  convertWithMarkItDown: mocks.convertWithMarkItDown,
}));

vi.mock('mammoth', () => ({
  default: {
    extractRawText: mocks.extractRawText,
  },
}));

vi.mock('pdf-parse', () => ({
  PDFParse: mocks.PDFParse,
}));

vi.mock('read-excel-file/node', () => ({
  default: mocks.readSheet,
}));

vi.mock('tesseract.js', () => ({
  createWorker: mocks.createWorker,
}));

describe('parser MarkItDown fallback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.convertWithMarkItDown.mockResolvedValue({ ok: false, message: 'MarkItDown unavailable' });
    mocks.extractRawText.mockResolvedValue({ value: ' Built-in Word text ' });
    mocks.pdfGetText.mockResolvedValue({ text: ' Built-in PDF text ' });
    mocks.pdfDestroy.mockResolvedValue(undefined);
    mocks.readSheet.mockResolvedValue([
      ['Name', 'Value'],
      ['alpha', 1],
    ]);
    mocks.recognize.mockResolvedValue({ data: { text: ' OCR text ' } });
    mocks.terminate.mockResolvedValue(undefined);
    mocks.createWorker.mockResolvedValue({
      recognize: mocks.recognize,
      terminate: mocks.terminate,
    });
  });

  it('falls back to mammoth for .docx when MarkItDown fails', async () => {
    const parsed = await parseUploadedFile(upload('brief.docx', 'docx-ish'));

    expect(parsed).toEqual({
      sourceType: 'word',
      filename: 'brief.docx',
      text: 'Built-in Word text',
    });
    expect(mocks.convertWithMarkItDown).toHaveBeenCalledTimes(1);
    expect(mocks.extractRawText).toHaveBeenCalledWith({ buffer: expect.any(Buffer) });
  });

  it('falls back to mammoth for .docx when MarkItDown is not installed', async () => {
    mocks.convertWithMarkItDown.mockResolvedValueOnce({
      ok: false,
      type: 'command_not_found',
      message:
        "MarkItDown CLI is not available. Install it with pip install 'markitdown[all]' or configure MARKITDOWN_COMMAND.",
    });

    const parsed = await parseUploadedFile(upload('brief.docx', 'docx-ish'));

    expect(parsed.text).toBe('Built-in Word text');
    expect(mocks.extractRawText).toHaveBeenCalledTimes(1);
  });

  it('falls back to pdf-parse when MarkItDown times out', async () => {
    mocks.convertWithMarkItDown.mockResolvedValueOnce({
      ok: false,
      type: 'timeout',
      message: 'MarkItDown conversion timed out after 15000ms.',
    });

    const parsed = await parseUploadedFile(upload('brief.pdf', '%PDF-ish'));

    expect(parsed.text).toBe('Built-in PDF text');
    expect(mocks.pdfGetText).toHaveBeenCalledTimes(1);
    expect(mocks.pdfDestroy).toHaveBeenCalledTimes(1);
  });

  it('falls back to read-excel-file when MarkItDown exits non-zero with stderr', async () => {
    mocks.convertWithMarkItDown.mockResolvedValueOnce({
      ok: false,
      type: 'failed',
      message: 'MarkItDown conversion failed (1): missing optional dependency',
      stderr: 'missing optional dependency',
    });

    const parsed = await parseUploadedFile(upload('data.xlsx', 'xlsx-ish'));

    expect(parsed.text).toBe('Name,Value\nalpha,1');
    expect(mocks.readSheet).toHaveBeenCalledTimes(1);
  });

  it('falls back to pdf-parse for .pdf and always destroys the parser', async () => {
    const file = upload('brief.pdf', '%PDF-ish');

    const parsed = await parseUploadedFile(file);

    expect(parsed).toEqual({
      sourceType: 'pdf',
      filename: 'brief.pdf',
      text: 'Built-in PDF text',
    });
    expect(mocks.PDFParse).toHaveBeenCalledWith({ data: file.buffer });
    expect(mocks.pdfGetText).toHaveBeenCalledTimes(1);
    expect(mocks.pdfDestroy).toHaveBeenCalledTimes(1);
  });

  it('falls back to read-excel-file for .xlsx when MarkItDown fails', async () => {
    const file = upload('data.xlsx', 'xlsx-ish');

    const parsed = await parseUploadedFile(file);

    expect(parsed).toEqual({
      sourceType: 'excel',
      filename: 'data.xlsx',
      text: 'Name,Value\nalpha,1',
    });
    expect(mocks.readSheet).toHaveBeenCalledWith(file.buffer);
  });

  it('falls back to read-excel-file for .xlsm when MarkItDown fails', async () => {
    const parsed = await parseUploadedFile(upload('macro.xlsm', 'xlsm-ish'));

    expect(parsed).toMatchObject({
      sourceType: 'excel',
      filename: 'macro.xlsm',
      text: 'Name,Value\nalpha,1',
    });
    expect(mocks.readSheet).toHaveBeenCalledTimes(1);
  });

  it('falls back to UTF-8 decoding for .csv when MarkItDown fails', async () => {
    const parsed = await parseUploadedFile(upload('data.csv', 'name,value\nalpha,1', 'text/csv'));

    expect(parsed).toEqual({
      sourceType: 'excel',
      filename: 'data.csv',
      text: 'name,value\nalpha,1',
    });
    expect(mocks.convertWithMarkItDown).toHaveBeenCalledTimes(1);
  });

  it('supports .xls when MarkItDown converts it successfully', async () => {
    mocks.convertWithMarkItDown.mockResolvedValueOnce({
      ok: true,
      text: ' | Name | Value |\n| --- | --- |\n| alpha | 1 | ',
    });

    const parsed = await parseUploadedFile(upload('legacy.xls', 'binary-ish'));

    expect(parsed).toEqual({
      sourceType: 'excel',
      filename: 'legacy.xls',
      text: '| Name | Value |\n| --- | --- |\n| alpha | 1 |',
      markdownFilename: 'legacy.md',
    });
    expect(mocks.readSheet).not.toHaveBeenCalled();
  });

  it('keeps the existing .xls 415 error when MarkItDown fails', async () => {
    await expect(parseUploadedFile(upload('legacy.xls', 'binary-ish'))).rejects.toMatchObject({
      status: 415,
      message: expect.stringContaining('Legacy .xls files are not supported yet'),
    });
  });

  it('supports .pptx when MarkItDown converts it successfully', async () => {
    mocks.convertWithMarkItDown.mockResolvedValueOnce({ ok: true, text: '# Deck\n\nA slide' });

    await expect(parseUploadedFile(upload('deck.pptx', 'pptx-ish'))).resolves.toEqual({
      sourceType: 'markdown',
      filename: 'deck.pptx',
      text: '# Deck\n\nA slide',
      markdownFilename: 'deck.md',
    });
  });

  it('returns 415 for .pptx when MarkItDown fails', async () => {
    await expect(parseUploadedFile(upload('deck.pptx', 'pptx-ish'))).rejects.toMatchObject({
      status: 415,
      message: 'Unable to parse .pptx with MarkItDown: MarkItDown unavailable',
    });
  });

  it('supports .html when MarkItDown converts it successfully', async () => {
    mocks.convertWithMarkItDown.mockResolvedValueOnce({ ok: true, text: 'Page heading' });

    await expect(parseUploadedFile(upload('page.html', '<h1>Page heading</h1>', 'text/html'))).resolves.toEqual({
      sourceType: 'markdown',
      filename: 'page.html',
      text: 'Page heading',
      markdownFilename: 'page.md',
    });
  });

  it('returns 415 for .html when MarkItDown fails', async () => {
    await expect(parseUploadedFile(upload('page.html', '<h1>Page heading</h1>', 'text/html'))).rejects.toMatchObject({
      status: 415,
      message: 'Unable to parse .html with MarkItDown: MarkItDown unavailable',
    });
  });

  it('falls back when MarkItDown returns empty output', async () => {
    mocks.convertWithMarkItDown.mockResolvedValueOnce({ ok: true, text: '   \n  ' });

    const parsed = await parseUploadedFile(upload('brief.docx', 'docx-ish'));

    expect(parsed.text).toBe('Built-in Word text');
    expect(mocks.extractRawText).toHaveBeenCalledTimes(1);
  });

  it('does not call MarkItDown for images and keeps OCR behavior', async () => {
    const parsed = await parseUploadedFile(upload('scan.png', 'image-ish', 'image/png'));

    expect(parsed).toEqual({
      sourceType: 'image',
      filename: 'scan.png',
      text: 'OCR text',
    });
    expect(mocks.convertWithMarkItDown).not.toHaveBeenCalled();
    expect(mocks.createWorker).toHaveBeenCalledWith('eng+chi_sim');
    expect(mocks.recognize).toHaveBeenCalledWith(expect.any(Buffer));
    expect(mocks.terminate).toHaveBeenCalledTimes(1);
  });

  it('does not call MarkItDown for Markdown text files', async () => {
    const parsed = await parseUploadedFile(upload('notes.md', '# Notes\n', 'text/markdown'));

    expect(parsed).toEqual({
      sourceType: 'text',
      filename: 'notes.md',
      text: '# Notes\n',
    });
    expect(mocks.convertWithMarkItDown).not.toHaveBeenCalled();
  });

  it('does not call MarkItDown for generic text MIME uploads', async () => {
    const parsed = await parseUploadedFile(upload('notes.custom', 'plain notes', 'text/plain'));

    expect(parsed).toEqual({
      sourceType: 'text',
      filename: 'notes.custom',
      text: 'plain notes',
    });
    expect(mocks.convertWithMarkItDown).not.toHaveBeenCalled();
  });
});

function upload(filename: string, content: string, mimetype = 'application/octet-stream'): Express.Multer.File {
  return {
    originalname: filename,
    mimetype,
    buffer: Buffer.from(content),
  } as Express.Multer.File;
}
