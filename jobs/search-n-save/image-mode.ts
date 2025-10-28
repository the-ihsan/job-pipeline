import path from 'path';
import { waitForInput } from '../../utils/index.ts';
import fs from 'fs/promises';
import * as fsSync from 'fs';
import clipboard from 'clipboardy';
import https from 'https';
import http from 'http';
import { getManualFilePath, padNumber } from './utils.ts';
import type { JobState } from './state.ts';
import { getActiveTab } from './tab-ctrl.ts';

export async function handleImageMode(
  state: JobState
): Promise<void> {
  console.log('\n🖼️  Entering Image Mode...');
  console.log('Click on an image in the browser, or use sub-commands:');
  console.log('  list - List all images on the page');
  console.log('  open <number> - Open indexed image in new tab');
  console.log('  img <number> - Download indexed image');
  console.log('  leave - Exit image mode');

  const page = await getActiveTab(state);
  if (!page) {
    console.log('❌ No active page found');
    return;
  }

  const pageUrl = page.url();

  await page.exposeBinding('saveImage', async (_, src: string) => {
    state.savedImageCount = await processImageDownload(state, src, pageUrl);
  });

  // Inject click handler
  await page.evaluate(() => {
    const saveImageWeb = async (src: string) => {
      // @ts-ignore
      window.__imageDownloading = true;
      // @ts-ignore
      await saveImage(src);
      // @ts-ignore
      window.__imageDownloading = false;
      return;
    };
    // @ts-ignore
    window.__imageClickHandler = (e: MouseEvent) => {
      // @ts-ignore
      if (window.__imageDownloading) return;
      let target = e.target as HTMLElement;

      // Check if target is an image
      if (target.tagName === 'IMG') {
        // @ts-ignore
        saveImageWeb((target as HTMLImageElement).src);
        return;
      }

      // Check siblings
      const parent = target.parentElement;
      if (parent) {
        const img = parent.querySelector('img');
        if (img) {
          // @ts-ignore
          saveImageWeb(img.src);
          return;
        }
      }

      // Check children
      const childImg = target.querySelector('img');
      if (childImg) {
        // @ts-ignore
        saveImageWeb(childImg.src);
      }
    };

    // @ts-ignore
    document.addEventListener('click', window.__imageClickHandler);
  });

  while (true) {
    const input = (await waitForInput(
      '\n🖼️  [list/open/save/leave]: '
    )) as string;
    const command = input.trim().toLowerCase();

    if (command === 'leave' || command === 'l') {
      console.log('📤 Leaving image mode...');
      break;
    }

    if (command === 'list') {
      try {
        const images = await page.evaluate(() => {
          const imgs = Array.from(document.querySelectorAll('img'));
          return imgs.map((img, idx) => ({
            index: idx,
            src: img.src,
            alt: img.alt || '(no alt)',
            width: img.width,
            height: img.height,
          }));
        });

        console.log(`\n📋 Found ${images.length} images:`);
        images.forEach(img => {
          console.log(
            `  [${img.index}] ${img.alt} - ${img.width}x${img.height}`
          );
          console.log(`      ${img.src}`);
        });
      } catch (error) {
        console.error('❌ Error listing images:', error);
      }
      continue;
    }

    if (command.startsWith('open ')) {
      const index = parseInt(command.split(' ')[1]);
      try {
        const imgSrc = await page.evaluate(idx => {
          const imgs = Array.from(document.querySelectorAll('img'));
          return imgs[idx]?.src;
        }, index);

        if (imgSrc) {
          await state.context.newPage().then(newPage => newPage.goto(imgSrc));
          console.log(`✅ Opened image ${index} in new tab`);
        } else {
          console.log(`❌ Image ${index} not found`);
        }
      } catch (error) {
        console.error('❌ Error opening image:', error);
      }
      continue;
    }

    if (command.startsWith('save ')) {
      const index = parseInt(command.split(' ')[1]);
      try {
        const imgSrc = await page.evaluate(idx => {
          const imgs = Array.from(document.querySelectorAll('img'));
          return imgs[idx]?.src;
        }, index);

        if (!imgSrc) {
          console.log(`❌ Image ${index} not found`);
          continue;
        }

        state.savedImageCount = await processImageDownload(
          state,
          imgSrc,
          pageUrl
        );
      } catch (error) {
        console.error('❌ Error downloading image:', error);
      }
      continue;
    }
  }

  try {
    // Remove click handler
    await page.evaluate(() => {
      // @ts-ignore
      if (window.__imageClickHandler) {
        // @ts-ignore
        document.removeEventListener('click', window.__imageClickHandler);
        // @ts-ignore
        delete window.__imageClickHandler;
      }
    });
  } catch (error) {
    console.error('❌ Error removing click handler:', error);
  }
}

async function processImageDownload(
  state: JobState,
  imgSrc: string,
  pageUrl: string
): Promise<number> {
  console.log(`\n📥 Downloading image: ${imgSrc.substring(0, 60)}...`);

  const urlWithoutQuery = imgSrc.split('?')[0];
  const pathSegments = urlWithoutQuery.split('/');
  const lastSegment = pathSegments[pathSegments.length - 1];

  const dotIndex = lastSegment.lastIndexOf('.');
  let ext = 'jpeg';

  if (dotIndex > 0 && dotIndex < lastSegment.length - 1) {
    ext = lastSegment.substring(dotIndex + 1).toLowerCase();
  }

  let currentImageCount = state.savedImageCount;
  let paddedNumber = padNumber(currentImageCount);
  let filename = `${paddedNumber}.${ext}`;
  let filepath = path.join(state.imagesDir, filename);

  // Safety check: verify image file doesn't already exist
  [filepath, currentImageCount] = await getManualFilePath(filepath);

  try {
    await downloadImage(imgSrc, filepath);
    console.log(`✅ Downloaded to images/${filename}`);

    console.log('📝 Copy the caption and press Enter...');
    await waitForInput('');

    const caption = clipboard.readSync() || '(no caption)';

    const metaFilename = `${paddedNumber}.txt`;
    const metaFilepath = path.join(state.imgMetaDir, metaFilename);
    const metaContent = `# ${currentImageCount}. ${pageUrl}\nimages/${filename}\n${caption}`;

    await fs.writeFile(metaFilepath, metaContent, 'utf8');

    console.log(`✅ Saved metadata to img-meta/${metaFilename}`);

    clipboard.writeSync('');
    return currentImageCount + 1;
  } catch (error) {
    console.error('❌ Error downloading image:', error);
    return currentImageCount;
  }
}


async function downloadImage(url: string, filepath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;

    client
      .get(url, response => {
        if (response.statusCode === 301 || response.statusCode === 302) {
          // Handle redirects
          downloadImage(response.headers.location!, filepath)
            .then(resolve)
            .catch(reject);
          return;
        }

        if (response.statusCode !== 200) {
          reject(new Error(`Failed to download image: ${response.statusCode}`));
          return;
        }

        const fileStream = fsSync.createWriteStream(filepath);
        response.pipe(fileStream);

        fileStream.on('finish', () => {
          fileStream.close();
          resolve();
        });

        fileStream.on('error', reject);
      })
      .on('error', reject);
  });
}
