import type { Browser, BrowserContext, Page } from 'playwright';
import { getJobFilePath, getOutputPath } from '../../utils/file.ts';
import fs from 'fs/promises';
import { connectToBrowser } from '../../utils/browser.ts';
import { spawn } from 'child_process';

export interface JobState {
  savedLinkCount: number;
  savedImageCount: number;
  inputLinks: string[];
  savedLinks: Set<string>;

  dataDir: string;
  imagesDir: string;
  imgMetaDir: string;
  browserSessionDir: string;

  cmdHint: string;
  activeTabIndex: number;

  browser: Browser;
  context: BrowserContext;
}

export async function initializeState(): Promise<JobState> {
  console.log('🔧 Initializing job state...');

  let port = Number(process.argv[3] || '0');

  if (!port) {
    port = 9222;
    await startChrome();
  } else {
    console.log(`🔗 Using existing Chrome on port ${port}`);
  }

  const { browser, context } = await connectToBrowser(port);
  

  const linksPath = getJobFilePath('links.txt');

  // Create necessary directories
  const dataDir = getOutputPath('data');
  const imagesDir = getOutputPath('images');
  const imgMetaDir = getOutputPath('img-meta');
  const browserSessionDir = getOutputPath('browser-session');

  console.log('📁 Creating output directories...');
  await fs.mkdir(dataDir, { recursive: true });
  await fs.mkdir(imagesDir, { recursive: true });
  await fs.mkdir(imgMetaDir, { recursive: true });
  await fs.mkdir(browserSessionDir, { recursive: true });

  let cmdHint = `💬 Command [next/prev/save/check/view/img/undo/exit]: `;

  let inputLinks: string[] = [];
  try {
    inputLinks = await readLinesFromFile(linksPath);
  } catch (_) {
    cmdHint = `💬 Command [save/check/view/img/undo/exit]: `;
  }

  // Load existing saved links
  const savedLinks = await loadExistingLinks();

  // Get counts from existing files
  const savedLinkCount = await getLastResultFileNumber(dataDir);
  const savedImageCount = await getLastImageNumber(imagesDir);

  console.log(
    `📊 Initialized: ${savedLinkCount} links, ${savedImageCount} images\n`
  );

  const state: JobState = {
    browser,
    context,
    savedLinkCount,
    savedImageCount,
    inputLinks,
    savedLinks,
    dataDir,
    imagesDir,
    imgMetaDir,
    browserSessionDir,
    cmdHint,
    activeTabIndex: 0,
  };

  const tabs = context.pages();
  for (const tab of tabs) {
    await attachFocusHelperPage(state, tab);
    attachCloseHandler(state, tab);
  }

  context.on('page', async (page) => {
    await attachFocusHelperPage(state, page);
    attachCloseHandler(state, page);
  });

  return state;
}

export async function startChrome(port: number = 9222) {
  console.log('🌐 Starting Chrome with remote debugging...');

  const userDataDir = getOutputPath('browser-session');

  const chromeProcess = spawn(
    'google-chrome',
    [`--remote-debugging-port=${port}`, `--user-data-dir=${userDataDir}`],
    {
      detached: true,
      stdio: 'ignore',
    }
  );

  chromeProcess.unref();

  // Wait a bit for Chrome to start
  await new Promise(resolve => setTimeout(resolve, 3000));

  console.log(`✅ Chrome started on port ${port}`);
  return chromeProcess;
}

export async function readLinesFromFile(filePath: string): Promise<string[]> {
  try {
    const content = await fs.readFile(filePath, 'utf8');
    return content.split('\n').filter(line => line.trim() !== '');
  } catch (error) {
    console.error(`❌ Failed to read file ${filePath}:`, error);
    process.exit(1);
  }
}

export async function loadExistingLinks(): Promise<Set<string>> {
  const linksFilePath = getOutputPath('links.txt');
  const links = new Set<string>();

  try {
    const content = await fs.readFile(linksFilePath, 'utf8');
    const lines = content.split('\n').filter(line => line.trim() !== '');
    lines.forEach(line => links.add(line.trim()));
    console.log(`📋 Loaded ${links.size} existing links`);
  } catch (error) {
    console.log('📋 No existing links file found, starting fresh');
  }

  return links;
}

export async function getLastImageNumber(imagesDir: string): Promise<number> {
  try {
    const files = await fs.readdir(imagesDir);

    if (files.length === 0) {
      console.log('🖼️  No existing images found, starting from 0');
      return 0;
    }

    // Extract numbers from filenames (format: XXXXX.ext)
    const numbers = files
      .map(file => {
        const match = file.match(/^(\d+)\./);
        return match ? parseInt(match[1]) : -1;
      })
      .filter(num => num >= 0);

    if (numbers.length === 0) {
      console.log('🖼️  No numbered images found, starting from 0');
      return 0;
    }

    const maxNumber = Math.max(...numbers);
    console.log(
      `🖼️  Found ${files.length} existing images, last number: ${maxNumber}`
    );
    return maxNumber + 1;
  } catch (error) {
    console.log('🖼️  No existing images directory, starting from 0');
    return 0;
  }
}

export async function getLastResultFileNumber(
  dataDir: string
): Promise<number> {
  try {
    await fs.mkdir(dataDir, { recursive: true });
    const files = await fs.readdir(dataDir);

    if (files.length === 0) {
      console.log('📄 No existing result files found, starting from 0');
      return 0;
    }

    // Extract numbers from filenames (format: result-XXXXX.txt)
    const numbers = files
      .map(file => {
        const match = file.match(/^result-(\d+)\.txt$/);
        return match ? parseInt(match[1]) : -1;
      })
      .filter(num => num >= 0);

    if (numbers.length === 0) {
      console.log('📄 No numbered result files found, starting from 0');
      return 0;
    }

    const maxNumber = Math.max(...numbers);
    console.log(
      `📄 Found ${files.length} existing result files, last number: ${maxNumber}`
    );
    return maxNumber + 1;
  } catch (error) {
    console.log('📄 No existing data directory, starting from 0');
    return 0;
  }
}

async function attachFocusHelperPage(
  state: JobState,
  page: Page,
) {
  await page.exposeBinding('focusHelper', async () => {
    const tabs = state.context.pages();
    let index = 0;
    for (const tab of tabs) {
      if (tab === page) {
        break;
      }
      index++;
    }
    state.activeTabIndex = Math.min(index, tabs.length - 1);
  });

  await page.evaluate(() => {
    // @ts-ignore
    document.addEventListener('click', focusHelper, {capture: true});
  });
}

function attachCloseHandler(state: JobState, page: Page) {
  page.on('close', async () => {
    const tabs = state.context.pages();
    
    // If no tabs left, reset to 0
    if (tabs.length === 0) {
      state.activeTabIndex = 0;
      return;
    }
    
    // If the active tab index is beyond the current tab count, adjust it
    if (state.activeTabIndex >= tabs.length) {
      state.activeTabIndex = tabs.length - 1;
    }
    await tabs[state.activeTabIndex].bringToFront();
  });
}
