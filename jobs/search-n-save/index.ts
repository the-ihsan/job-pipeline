import { waitForInput, saveToTXT, getOutputPath } from '../../utils/index.ts';
import fs from 'fs/promises';
import clipboard from 'clipboardy';
import { initializeState } from './state.ts';
import { getManualFilePath, padNumber } from './utils.ts';

import { getActiveTabUrl } from './tab-ctrl.ts';

import { handleImageMode } from './image-mode.ts';
import path from 'path';

export default async function main() {
  console.log('🚀 Starting Google Dorking Job');

  // Initialize job state (creates dirs, loads links, counts existing files)
  const state = await initializeState();

  try {
    let currentIndex = 0;

    while (true) {
      const input = (await waitForInput(`\n💬 ${state.cmdHint}`)) as string;
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
          const paddedNumber = padNumber(state.savedLinkCount);
          const filename = `result-${paddedNumber}.txt`;
          const outputFilePath = path.join(state.dataDir, filename);

          try {
            // Safety check: verify URL matches before deleting file
            const fileContent = await fs.readFile(outputFilePath, 'utf8');
            const firstLine = fileContent.split('\n')[0];
            const urlMatch = firstLine.match(/^# \d+: (.+)$/);

            if (urlMatch && urlMatch[1] === lastUrl) {
              // URLs match, safe to delete
              await fs.unlink(outputFilePath);
              console.log(
                `✅ Undone: Removed ${filename} and link: ${lastUrl}`
              );
            } else {
              // URLs don't match, only remove link
              console.log(
                `⚠️ URL mismatch! File ${filename} contains different URL. Only removed link from links.txt.`
              );
              console.log(`   Link removed: ${lastUrl}`);
              if (urlMatch) {
                console.log(`   File contains: ${urlMatch[1]}`);
              }
            }
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
          await handleImageMode(state);
        } catch (error) {
          console.error('❌ Error in image mode:', error);
        }
        continue;
      } else if (command === 'check' || command === 'c') {
        try {
          const currentUrl = await getActiveTabUrl(state);

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
          const currentUrl = await getActiveTabUrl(state);

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

          // Safety check: verify file doesn't already exist
          let paddedNumber = padNumber(state.savedLinkCount);
          let filename = `result-${paddedNumber}.txt`;
          let outputFilePath = path.join(state.dataDir, filename);

          [outputFilePath, state.savedLinkCount] =
            await getManualFilePath(outputFilePath);

          const content = `# ${state.savedLinkCount}: ${currentUrl}\n\n${clipboardContent}`;

          // Save to data directory
          await fs.writeFile(outputFilePath, content, 'utf8');

          const linksFilePath = getOutputPath('links.txt');
          await fs.appendFile(linksFilePath, `${currentUrl}\n`, 'utf8');

          state.savedLinks.add(currentUrl);

          const overview = clipboardContent.slice(0, 50);

          console.log(`✅ ${state.savedLinkCount}: ${currentUrl}\n`);
          console.log(`   ${overview}`);
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
    await state.browser.close();
    console.log('🔒 Browser connection closed');
  }
}
