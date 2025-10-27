import {
  getJobFilePath,
  connectToBrowser,
  waitForInput,
} from '../../utils/index.ts';
import fs from 'fs/promises';
import clipboard from 'clipboardy';
import path from 'path';
import {
  getActiveTabUrl,
  getLastImageNumber,
  loadExistingLinks,
  readLinesFromFile,
  startChrome,
} from './utils.ts';
import { handleImageMode } from './image-mode.ts';

export default async function main() {
  console.log('🚀 Starting Google Dorking Job');

  const linksPath = getJobFilePath('links.txt');
  try {
    await fs.access(linksPath);
  } catch {
    console.error(`Input file not found: ${linksPath}`);
    process.exit(1);
  }

  console.log(`📖 Reading lines from: ${linksPath}`);
  const lines = await readLinesFromFile(linksPath);
  console.log(`📊 Found ${lines.length} lines to process\n`);

  if (lines.length === 0) {
    console.log('⚠️ No lines found in input file');
    return;
  }

  const jobDir = path.dirname(linksPath);
  const browserSessionDir = path.join(jobDir, 'browser-session');
  const outputDir = path.join(jobDir, 'output');

  await fs.mkdir(browserSessionDir, { recursive: true });
  await fs.mkdir(outputDir, { recursive: true });

  const savedLinks = await loadExistingLinks(outputDir);

  const initialImageCount = await getLastImageNumber(outputDir);

  await startChrome(browserSessionDir);

  const { browser, context } = await connectToBrowser();

  try {
    let currentIndex = 0;
    let savedCount = 0;
    let imageCount = initialImageCount;

    while (true) {
      const input = (await waitForInput(
        '\n💬 Command [next/prev/save/check/view/img/exit]: '
      )) as string;
      const command = input.trim().toLowerCase();

      if (command === 'exit' || command === 'e') {
        console.log('👋 Exiting...');
        break;
      }

      if (command === 'next' || command === 'n') {
        if (currentIndex >= lines.length) {
          console.log('⚠️ No more lines to process. Reached end of file.');
          continue;
        }

        const line = lines[currentIndex];
        console.log(`\n📋 Line #${currentIndex + 1}: ${line}`);
        currentIndex++;
      } else if (command === 'prev' || command === 'p') {
        if (currentIndex <= 0) {
          console.log('⚠️ No previous line to go back to.');
          continue;
        }
        currentIndex--;
        const line = lines[currentIndex];
        console.log(`\n📋 Line #${currentIndex + 1}: ${line}`);
      } else if (command === 'view' || command === 'v') {
        try {
          const clipboardContent = clipboard.readSync();

          if (!clipboardContent || clipboardContent.trim() === '') {
            console.log('⚠️ Clipboard is empty.');
          } else {
            const preview = clipboardContent.slice(0, 200);
            const suffix = clipboardContent.length > 200 ? '...' : '';
            console.log(
              `\n📄 Clipboard preview (${clipboardContent.length} chars):\n${preview}${suffix}`
            );
          }
        } catch (error) {
          console.error('❌ Error reading clipboard:', error);
        }
      } else if (command === 'img' || command === 'i') {
        imageCount = await handleImageMode(context, outputDir, imageCount);
      } else if (command === 'check' || command === 'c') {
        try {
          const currentUrl = await getActiveTabUrl(context);

          if (savedLinks.has(currentUrl)) {
            console.log(`🔴 Already saved: ${currentUrl}`);
          } else {
            console.log(`🟢 New URL: ${currentUrl}`);
          }
        } catch (error) {
          console.error('❌ Error checking URL:', error);
        }
      } else if (command === 'save' || command === 's') {
        try {
          const currentUrl = await getActiveTabUrl(context);

          if (savedLinks.has(currentUrl)) {
            console.log(
              '⚠️  Duplicate link detected! This URL was already saved. Skipping...'
            );
            continue;
          }

          const clipboardContent = clipboard.readSync();

          if (!clipboardContent || clipboardContent.trim() === '') {
            console.log('⚠️ Clipboard is empty. Nothing to save.');
            continue;
          }

          const paddedNumber = String(savedCount).padStart(5, '0');
          const filename = `result-${paddedNumber}.txt`;

          const content = `# ${savedCount}: ${currentUrl}\n\n${clipboardContent}`;

          const outputFilePath = path.join(outputDir, filename);
          await fs.writeFile(outputFilePath, content, 'utf8');

          const linksFilePath = path.join(outputDir, 'links.txt');
          await fs.appendFile(linksFilePath, `${currentUrl}\n`, 'utf8');

          savedLinks.add(currentUrl);

          const overview = clipboardContent.slice(0, 100);

          console.log(`✅ Saved to ${filename}: ${overview}`);
          savedCount++;

          clipboard.writeSync('');
        } catch (error) {
          console.error('❌ Error saving:', error);
        }
      } else {
        console.log(
          '❓ Unknown command. Use: next (n), prev (p), check (c), view (v), img (i), save (s), or exit (e)'
        );
      }
    }

    console.log(`\n🎉 Job completed. Saved ${savedCount} files.`);
  } catch (error) {
    console.error('❌ Fatal error during processing:', error);
  } finally {
    await browser.close();
    console.log('🔒 Browser connection closed');
  }
}
