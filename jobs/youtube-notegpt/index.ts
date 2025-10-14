import { start, connectToFirefox, waitForInput } from '../../utils/index.ts';
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import type { Browser as PlaywrightBrowser, BrowserContext } from 'playwright';
import fs from 'fs/promises';
import path from 'path';
import { saveToTXT } from '../../utils/file.ts';

puppeteer.use(StealthPlugin());

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

async function logFailedLine(line: string, error: Error): Promise<void> {
  const failedPath = path.resolve('jobs/youtube-notegpt/output/failed.txt');
  await fs.mkdir(path.dirname(failedPath), { recursive: true });

  const errorMessage = `Line: "${line}"\nError: ${error.message}\nTimestamp: ${new Date().toISOString()}\n---\n`;
  await fs.appendFile(failedPath, errorMessage, 'utf8');
  console.log(`❌ Failed to process line: "${line}" - ${error.message}`);
}

const init = async (_: JobState) => {
  const inputFilePath = 'jobs/youtube-notegpt/links.txt';
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
  if (Number(lineNumber) < 4) {
    return;
  }

  const result: Result = {
    lineNumber,
    content: '',
    success: false,
  };

  try {
    console.log(
      `📝 Processing line ${lineNumber}: "${line.substring(0, 50)}${line.length > 50 ? '...' : ''}"`
    );

    const page = await context.newPage();

    try {
      await page.goto('https://notegpt.io/workspace/home?utm_source=ng_home', {
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

      await waitForInput('Copy and hit enter to continue...');

      const clipboardContent = await page.evaluate(async () => {
        try {
          return await navigator.clipboard.readText();
        } catch (error) {
          console.error('Clipboard read error:', error);
          return '';
        }
      });

      if (!clipboardContent) {
        throw new Error('Failed to read clipboard content');
      }

      result.content = clipboardContent;
      result.success = true;

      console.log(`✅ Successfully processed line ${lineNumber}`);
    } finally {
      await page.close();
    }
  } catch (error) {
    await logFailedLine(line, error as Error);
    result.success = false;
    result.content = '';
  }

  if (result.success && result.content) {
    const paddedLineNumber = String(result.lineNumber).padStart(3, '0');
    const outputFilename = `result-${paddedLineNumber}.txt`;
    result.content = `#${Number(lineNumber)+1}${line}\n${result.content}`;
    await saveToTXT(result.content, outputFilename);
  }
};

export default async function main() {
  const { browser, context } = await connectToFirefox();

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
