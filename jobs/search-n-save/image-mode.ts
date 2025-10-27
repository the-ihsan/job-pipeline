import path from 'path';
import type { BrowserContext, Page } from 'playwright';
import { waitForInput } from '../../utils/index.ts';
import fs from 'fs/promises';
import * as fsSync from 'fs';
import clipboard from 'clipboardy';
import https from 'https';
import http from 'http';

export async function handleImageMode(
  context: BrowserContext,
  outputDir: string,
  imageCount: number
): Promise<number> {
  console.log('\n🖼️  Entering Image Mode...');
  console.log('Click on an image in the browser, or use sub-commands:');
  console.log('  list - List all images on the page');
  console.log('  open <number> - Open indexed image in new tab');
  console.log('  img <number> - Download indexed image');
  console.log('  leave - Exit image mode');

  const page = await getActivePage(context);
  if (!page) {
    console.log('❌ No active page found');
    return imageCount;
  }

  const pageUrl = page.url();
  const imagesDir = path.join(outputDir, 'images');
  await fs.mkdir(imagesDir, { recursive: true });

  await page.exposeBinding('saveImage', async (_, src: string) => {
    await processImageDownload(src, pageUrl, imagesDir, outputDir, imageCount);
    return;
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

  let currentImageCount = imageCount;

  while (true) {
    const input = (await waitForInput(
      '\n🖼️  [list/open/img/leave]: '
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
          await context.newPage().then(newPage => newPage.goto(imgSrc));
          console.log(`✅ Opened image ${index} in new tab`);
        } else {
          console.log(`❌ Image ${index} not found`);
        }
      } catch (error) {
        console.error('❌ Error opening image:', error);
      }
      continue;
    }

    if (command.startsWith('img ')) {
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

        await processImageDownload(
          imgSrc,
          pageUrl,
          imagesDir,
          outputDir,
          currentImageCount
        );
        currentImageCount++;
      } catch (error) {
        console.error('❌ Error downloading image:', error);
      }
      continue;
    }
  }

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

  return currentImageCount;
}

async function processImageDownload(
  imgSrc: string,
  pageUrl: string,
  imagesDir: string,
  outputDir: string,
  imageCount: number
): Promise<void> {
  console.log(`\n📥 Downloading image: ${imgSrc.substring(0, 60)}...`);

  const urlWithoutQuery = imgSrc.split('?')[0];
  const pathSegments = urlWithoutQuery.split('/');
  const lastSegment = pathSegments[pathSegments.length - 1];

  const dotIndex = lastSegment.lastIndexOf('.');
  let ext = 'jpeg'; 

  if (dotIndex > 0 && dotIndex < lastSegment.length - 1) {
    ext = lastSegment.substring(dotIndex + 1).toLowerCase();
  }

  const paddedNumber = String(imageCount).padStart(5, '0');
  const filename = `${paddedNumber}.${ext}`;
  const filepath = path.join(imagesDir, filename);

  try {
    await downloadImage(imgSrc, filepath);
    console.log(`✅ Downloaded to images/${filename}`);

    console.log('📝 Copy the caption and press Enter...');
    await waitForInput('');

    const caption = clipboard.readSync() || '(no caption)';

    const imgMetaDir = path.join(outputDir, 'img-meta');
    await fs.mkdir(imgMetaDir, { recursive: true });

    const metaFilename = `${paddedNumber}.txt`;
    const metaFilepath = path.join(imgMetaDir, metaFilename);
    const metaContent = `# ${imageCount}. ${pageUrl}\nimages/${filename}\n${caption}`;

    await fs.writeFile(metaFilepath, metaContent, 'utf8');

    console.log(`✅ Saved metadata to img-meta/${metaFilename}`);

    clipboard.writeSync('');
  } catch (error) {
    console.error('❌ Error downloading image:', error);
  }
}

async function getActivePage(context: BrowserContext): Promise<Page | null> {
  try {
    const pages = context.pages();

    if (pages.length === 0) {
      return null;
    }

    for (const page of pages) {
      try {
        const isFocused = await page.evaluate(() => document.hasFocus());
        if (isFocused) {
          return page;
        }
      } catch (e) {
        continue;
      }
    }

    return pages[pages.length - 1];
  } catch (error) {
    console.error('Error getting active page:', error);
    return null;
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
