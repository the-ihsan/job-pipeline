import { waitForInput } from '../../utils/index.ts';
import clipboard from 'clipboardy';
import type { JobState } from './state.ts';
import { getActiveTab } from './tab-ctrl.ts';
import type { Page } from 'playwright';

interface AncestorInfo {
  index: number;
  textContent: string;
  textPreview: string;
}

let currentAncestors: AncestorInfo[] = [];
let currentCopiedText: string = '';

export async function initializeCopyMode(state: JobState): Promise<void> {
  await state.context.exposeBinding(
    'captureElement',
    async (_source, ancestorsData: AncestorInfo[]) => {
      if (!state.isCopyMode) {
        return;
      }
      currentAncestors = ancestorsData;
      console.log(
        `\n📝 Captured element with ${ancestorsData.length} ancestors`
      );
      displayAncestors(ancestorsData);
    }
  );
}

export async function initCopyModePage(page: Page): Promise<void> {
  // Inject click handler
  try {
    await page.evaluate(() => {
      // @ts-ignore
      if (window.__copyClickHandler) {
        return;
      }
      // @ts-ignore
      window.__copyClickHandler = (e: MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();

        // @ts-ignore
        let target = e.target as HTMLElement;

        const ancestors: AncestorInfo[] = [];
        let current: HTMLElement | null = target;
        let index = 0;

        while (current && current !== document.body.parentElement) {
          const clone = current.cloneNode(true) as HTMLElement;
          clone.querySelectorAll('script, style, link').forEach(node => {
            node.remove();
          });
          const textContent = (clone.textContent || '').replace(/\s+/g, ' ').trim();
          let textPreview = textContent
            .slice(0, 100)
            .replace(/\s+/g, ' ')
            .trim();

          if (textContent.length > 100) {
            textPreview += '...';
            textPreview += textContent.slice(
              Math.max(100, textContent.length - 100)
            );
          }

          ancestors.push({
            index: index,
            textContent: textContent,
            textPreview: textPreview,
          });

          current = current.parentElement;
          index++;
        }

        // @ts-ignore
        captureElement(ancestors);
      };

      // @ts-ignore
      document.addEventListener('click', window.__copyClickHandler, true);
    });
  } catch (error: any) {
    console.error('Failed to initialize copy mode:', error.message || error);
  }
}

export async function handleCopyMode(state: JobState): Promise<boolean> {
  console.log('\n📝 Entering Copy Mode...');
  console.log('Click on an element in the browser, or use sub-commands:');
  console.log('  save - Save current copied text and exit copy mode');
  console.log('  pick <number> - Copy text content of the n-th ancestor');
  console.log('  trim <start> <end> - Trim the copied content');
  console.log('  list - Show the last captured ancestors again');
  console.log('  view - View current copied text');
  console.log('  leave - Exit copy mode without saving');

  const page = await getActiveTab(state);
  if (!page) {
    console.log('❌ No active page found');
    return false;
  }

  currentAncestors = [];
  currentCopiedText = '';
  let shouldSave = false;

  while (true) {
    const input = (await waitForInput(
      '\n📝 [save/pick/trim/list/view/leave]: '
    )) as string;
    const command = input.trim().toLowerCase();
    const parts = input.trim().split(/\s+/);

    if (command === 'leave' || command === 'l') {
      console.log('📤 Leaving copy mode...');
      break;
    }

    if (command === 'save' || command === 's') {
      if (!currentCopiedText || currentCopiedText.trim() === '') {
        console.log('⚠️ No text has been copied yet. Use "pick <n>" first.');
        continue;
      }

      // Copy to clipboard
      clipboard.writeSync(currentCopiedText);
      console.log('✅ Text copied to clipboard. Exiting copy mode to save...');
      shouldSave = true;
      break;
    }

    if (command === 'list') {
      if (currentAncestors.length === 0) {
        console.log('⚠️ No element captured yet. Click on an element first.');
      } else {
        displayAncestors(currentAncestors);
      }
      continue;
    }

    if (command === 'view' || command === 'v') {
      if (!currentCopiedText || currentCopiedText.trim() === '') {
        console.log('⚠️ No text has been copied yet.');
      } else {
        console.log(
          `\n📄 Current copied text (${currentCopiedText.length} chars):`
        );
        const preview = currentCopiedText.slice(0, 500);
        const suffix = currentCopiedText.length > 500 ? '...' : '';
        console.log(`${preview}${suffix}`);
      }
      continue;
    }

    if (parts[0] === 'pick' || parts[0] === 'p') {
      if (currentAncestors.length === 0) {
        console.log('⚠️ No element captured yet. Click on an element first.');
        continue;
      }

      const index = parseInt(parts[1]);
      if (isNaN(index)) {
        console.log('❌ Invalid index. Usage: pick <number>');
        continue;
      }

      const ancestor = currentAncestors.find(a => a.index === index);
      if (!ancestor) {
        console.log(
          `❌ Ancestor ${index} not found. Use "list" to see available ancestors.`
        );
        continue;
      }

      currentCopiedText = ancestor.textContent;
      console.log(
        `✅ Copied ${currentCopiedText.length} characters from [${index}]`
      );
      const preview = currentCopiedText
        .slice(0, 200)
        .replace(/\s+/g, ' ')
        .trim();
      const suffix = currentCopiedText.length > 200 ? '...' : '';
      console.log(`   Preview: ${preview}${suffix}`);
      continue;
    }

    if (parts[0] === 'trim' || parts[0] === 't') {
      if (!currentCopiedText || currentCopiedText.trim() === '') {
        console.log('⚠️ No text to trim. Use "pick <n>" first.');
        continue;
      }

      if (parts.length < 2) {
        console.log('❌ Usage: trim <start> <end>');
        console.log(
          '   - Numbers: trim by character position (e.g., trim 0 100)'
        );
        console.log(
          '   - Strings: trim until first occurrence (e.g., trim "Chapter" "End")'
        );
        continue;
      }

      const start = parts[1];
      const end = parts[2];

      try {
        currentCopiedText = trimText(currentCopiedText, start, end);
        console.log(`✅ Trimmed to ${currentCopiedText.length} characters`);
        const preview = currentCopiedText
          .slice(0, 200)
          .replace(/\s+/g, ' ')
          .trim();
        const suffix = currentCopiedText.length > 200 ? '...' : '';
        console.log(`   Preview: ${preview}${suffix}`);
      } catch (error: any) {
        console.error('❌ Error trimming text:', error.message || error);
      }
      continue;
    }

    console.log(
      '❓ Unknown command. Use: save, pick <n>, trim <start> <end>, list, view, or leave'
    );
  }

  return shouldSave;
}

function displayAncestors(ancestors: AncestorInfo[]): void {
  console.log(`\n📋 Element ancestors (${ancestors.length} total):`);
  ancestors.forEach(ancestor => {
    const textLen = ancestor.textContent.length;

    console.log(`  [${ancestor.index}] - ${textLen} chars`);
    console.log(`      ${ancestor.textPreview}`);
  });
}

function trimText(text: string, start: string, end?: string): string {
  end ||= '0';
  const startNum = Number(start);
  const endNum = Number(end);

  let startIdx = 0;
  let endIdx = text.length;

  if (!isNaN(startNum)) {
    startIdx = text.indexOf(start, startNum);
    if (startIdx === -1) {
      throw new Error(`Start string "${start}" not found in text`);
    }
  } else {
    startIdx = startNum;
  }

  if (!isNaN(endNum)) {
    let tmpEnd = text.length;
    while (tmpEnd !== -1) {
      endIdx = tmpEnd;
      tmpEnd = text.indexOf(end, tmpEnd + 1);
    }
    if (endIdx === text.length) {
      throw new Error(`End string "${end}" not found in text`);
    }
  } else {
    endIdx = text.length - endNum;
  }

  return text.slice(startIdx, endIdx);
}
