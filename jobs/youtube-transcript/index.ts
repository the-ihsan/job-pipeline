import { start, connectToBrowser, waitForInput } from '../../utils/index.ts';
import type { Browser as PlaywrightBrowser, BrowserContext } from 'playwright';
import fs from 'fs/promises';
import { saveToTXT, getJobFilePath, appendToTXT } from '../../utils/file.ts';
import clipboard from 'clipboardy';

interface JobState {
  browser: PlaywrightBrowser;
  context: BrowserContext;
}

interface Result {
  lineNumber: number | string;
  content: string;
  success: boolean;
}

async function readLinesFromFile(filePath: string): Promise<string[]> {
  try {
    const content = await fs.readFile(filePath, 'utf8');
    return content.split('\n').filter(line => line.trim() !== '');
  } catch (error) {
    console.error(`❌ Failed to read file ${filePath}:`, error);
    process.exit(1);
  }
}

const init = async (_: JobState) => {
  const inputFilePath = getJobFilePath('links.txt');
  try {
    await fs.access(inputFilePath);
  } catch {
    console.error(`Input file not found: ${inputFilePath}`);
    process.exit(1);
  }

  console.log(`📖 Reading lines from: ${inputFilePath}`);
  const lines = await readLinesFromFile(inputFilePath);
  console.log(`📊 Found ${lines.length} lines to process`);

  if (lines.length === 0) {
    console.log('⚠️ No lines found in input file');
    return [];
  }

  return lines;
};

const processLine = async (
  line: string,
  { context }: JobState,
  lineNumber: number | string
) => {
  const result: Result = {
    lineNumber,
    content: '',
    success: false,
  };
  const lineString = `#${Number(lineNumber) + 1}. ${line}`;

  try {
    console.log(
      `📝 Processing line ${lineNumber}: "${line.substring(0, 50)}${line.length > 50 ? '...' : ''}"`
    );

    const page = await context.newPage();

    try {
      await page.goto('https://www.youtube-transcript.io', {
        waitUntil: 'networkidle',
      });

      await page.exposeFunction('getLine', () => {
        return line;
      });

      const tryPasting = async () => {
        const focusedElement = document.activeElement;
        if (!focusedElement) {
          return false;
        }
        // @ts-ignore
        const line = await window.getLine();
        // @ts-ignore
        focusedElement.value = line;
        return true;
      };

      const hasPasted = await page.evaluate(tryPasting);
      if (!hasPasted) {
        await waitForInput('Focus the input...');
        await page.evaluate(tryPasting);
      }

      let clipboardContent: string | undefined = undefined;

      while (!clipboardContent || clipboardContent === line) {
        const input = await waitForInput('[s]kip/Save: ');
        if (input === 'skip' || input === 's') {
          await appendToTXT(lineString, 'skipped.txt');
          return;
        }
        clipboardContent = clipboard.readSync();
      }

      result.content = clipboardContent;
      result.success = true;

      clipboard.writeSync('');

      console.log(`✅ Successfully processed line ${lineNumber}`);
    } finally {
      await page.close();
    }
  } catch (error) {
    await appendToTXT(lineString, 'failed.txt');
    result.success = false;
    result.content = '';
  }

  if (result.success && result.content) {
    const paddedLineNumber = String(result.lineNumber).padStart(3, '0');
    const outputFilename = `result-${paddedLineNumber}.txt`;
    result.content = `${lineString}\n${result.content}`;
    await saveToTXT(result.content, outputFilename);
  }
};

export default async function main() {
  const { browser, context } = await connectToBrowser();

  const state: JobState = {
    browser,
    context,
  };

  try {
    await start<JobState>(init, state).pipeEach(processLine).run();

    console.log('🎉 Completed processing all lines');
  } catch (error) {
    console.error('❌ Fatal error during processing:', error);
  } finally {
    await browser.close();
    console.log('🔒 Browser connection closed');
  }
}
