import fs from 'fs/promises';
import path from 'path';
import { spawn } from 'child_process';

export async function readLinesFromFile(filePath: string): Promise<string[]> {
  try {
    const content = await fs.readFile(filePath, 'utf8');
    return content.split('\n').filter(line => line.trim() !== '');
  } catch (error) {
    console.error(`❌ Failed to read file ${filePath}:`, error);
    process.exit(1);
  }
}

export async function loadExistingLinks(
  outputDir: string
): Promise<Set<string>> {
  const linksFilePath = path.join(outputDir, 'links.txt');
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

export async function getLastImageNumber(outputDir: string): Promise<number> {
  const imagesDir = path.join(outputDir, 'images');

  try {
    await fs.mkdir(imagesDir, { recursive: true });
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

export async function startChrome(userDataDir: string, port: number = 9222) {
  console.log('🌐 Starting Chrome with remote debugging...');

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

export async function getActiveTabUrl(context: any): Promise<string> {
  try {
    const pages = context.pages();

    if (pages.length === 0) {
      return 'about:blank';
    }

    for (const page of pages) {
      try {
        const isFocused = await page.evaluate(() => document.hasFocus());
        if (isFocused) {
          return page.url();
        }
      } catch (e) {
        continue;
      }
    }

    return pages[pages.length - 1].url();
  } catch (error) {
    console.error('Error getting active tab URL:', error);
    return 'about:blank';
  }
}
