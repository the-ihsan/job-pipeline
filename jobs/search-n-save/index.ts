import {
  connectToBrowser,
  waitForInput,
  saveToTXT,
  getOutputPath,
} from '../../utils/index.ts';
import fs from 'fs/promises';
import clipboard from 'clipboardy';
import {
  getActiveTabUrl,
  startChrome,
  initializeState,
  type JobState,
} from './utils.ts';
import { handleImageMode } from './image-mode.ts';

export default async function main() {
  console.log('🚀 Starting Google Dorking Job');

  // Initialize job state (creates dirs, loads links, counts existing files)
  const state: JobState = await initializeState();

  let port = Number(process.argv[3] || '0');

  if (!port) {
    port = 9222;
    await startChrome();
  } else {
    console.log(`🔗 Using existing Chrome on port ${port}`);
  }

  const { browser, context } = await connectToBrowser(port);

  try {
    let currentIndex = 0;

    while (true) {
      const input = (await waitForInput(
        '\n💬 Command [next/prev/save/check/view/img/undo/exit]: '
      )) as string;
      const command = input.trim().toLowerCase();

      if (command === 'exit' || command === 'e') {
        console.log('👋 Exiting...');
        break;
      }

      if (command === 'undo' || command === 'u') {
        try {
          if (state.savedLinkCount === 0) {
            console.log('⚠️ Nothing to undo. No saves have been made yet.');
            continue;
          }

          const linksFilePath = getOutputPath('links.txt');

          // Read all lines from links.txt
          let linkLines: string[] = [];
          try {
            const linksContent = await fs.readFile(linksFilePath, 'utf8');
            linkLines = linksContent
              .split('\n')
              .filter(line => line.trim() !== '');
          } catch (error) {
            console.log('⚠️ No links.txt file found. Nothing to undo.');
            continue;
          }

          if (linkLines.length === 0) {
            console.log('⚠️ No links to undo.');
            continue;
          }

          // Get the last URL
          const lastUrl = linkLines[linkLines.length - 1];

          // Remove the last line and write back
          const updatedLinks = linkLines.slice(0, -1);
          await saveToTXT(updatedLinks, linksFilePath);

          // Remove from the set
          state.savedLinks.delete(lastUrl);

          state.savedLinkCount--;
          // Delete the corresponding result file from data directory
          const paddedNumber = String(state.savedLinkCount).padStart(5, '0');
          const filename = `result-${paddedNumber}.txt`;
          const outputFilePath = getOutputPath('data', filename);

          try {
            await fs.unlink(outputFilePath);
            console.log(`✅ Undone: Removed ${filename} and link: ${lastUrl}`);
          } catch (error) {
            console.log(`⚠️ Removed link but file ${filename} not found.`);
          }
        } catch (error) {
          console.error('❌ Error during undo:', error);
        }
      } else if (command === 'next' || command === 'n') {
        if (currentIndex >= state.inputLinks.length) {
          console.log('⚠️ No more lines to process. Reached end of file.');
          continue;
        }

        const line = state.inputLinks[currentIndex];
        console.log(`\n📋 Line #${currentIndex + 1}: ${line}`);
        currentIndex++;
      } else if (command === 'prev' || command === 'p') {
        if (currentIndex <= 0) {
          console.log('⚠️ No previous line to go back to.');
          continue;
        }
        currentIndex--;
        const line = state.inputLinks[currentIndex];
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
        try {
          state.savedImageCount = await handleImageMode(
            context,
            state.savedImageCount
          );
        } catch (error) {
          console.error('❌ Error in image mode:', error);
        }
        continue;
      } else if (command === 'check' || command === 'c') {
        try {
          const currentUrl = await getActiveTabUrl(context);

          if (state.savedLinks.has(currentUrl)) {
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

          if (state.savedLinks.has(currentUrl)) {
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

          const paddedNumber = String(state.savedLinkCount).padStart(5, '0');
          const filename = `result-${paddedNumber}.txt`;

          const content = `# ${state.savedLinkCount}: ${currentUrl}\n\n${clipboardContent}`;

          // Save to data directory
          const outputFilePath = getOutputPath('data', filename);
          await fs.writeFile(outputFilePath, content, 'utf8');

          const linksFilePath = getOutputPath('links.txt');
          await fs.appendFile(linksFilePath, `${currentUrl}\n`, 'utf8');

          state.savedLinks.add(currentUrl);

          const overview = clipboardContent.slice(0, 100);

          console.log(`✅ Saved to ${filename}: ${overview}`);
          state.savedLinkCount++;

          clipboard.writeSync('');
        } catch (error) {
          console.error('❌ Error saving:', error);
        }
      } else {
        console.log(
          '❓ Unknown command. Use: next (n), prev (p), check (c), view (v), img (i), save (s), undo (u), or exit (e)'
        );
      }
    }

    console.log(`\n🎉 Job completed. Saved ${state.savedLinkCount} links.`);
  } catch (error) {
    console.error('❌ Fatal error during processing:', error);
  } finally {
    await browser.close();
    console.log('🔒 Browser connection closed');
  }
}
