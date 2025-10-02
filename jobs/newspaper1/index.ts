import { start } from '../../utils/index.ts';
import puppeteer from 'puppeteer-extra';
import type { Browser } from 'puppeteer';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { findEmail, getNewspaperInfoWithoutEmail } from './utils.ts';

puppeteer.use(StealthPlugin());

interface JobState {
  browser: Browser;
}

const init = async ({ browser }: JobState) => {
  const page = await browser.newPage();
  const mainurl = 'https://allonlinebanglanewspapers.com/index.php';
  console.log('Waiting for page to load...');
  await page.goto(mainurl, {
    waitUntil: 'networkidle0',
  });

  await page.waitForSelector('article');

  const names: string[] = [];

  await page.exposeFunction('push_name', (name: string) => {
    if (name) {
      names.push(name);
    }
  });

  await page.evaluate(() => {
    const main_body = document.querySelector('article')!;
    const newspapers = main_body.children;
    console.log('Found', newspapers.length, 'newspapers');

    for (let i = 0; i < newspapers.length; i++) {
      const newspaper = newspapers[i];
      const link = newspaper.querySelector('h6 a')?.getAttribute('href');
      // @ts-ignore
      window.push_name(link);
    }
  });
  await page.close();
  console.log('Found', names.length, 'newspapers');
  return names;
};

const processNewspapers = async (urls: string[], { browser }: JobState) => {
  const SLICE_SIZE = 5;
  const results: {
    name: string;
    email: string;
    source: string;
  }[] = [];
  for (let i = 0; i < urls.length; i += SLICE_SIZE) {
    const slice = urls.slice(i, i + SLICE_SIZE);
    const promises: Promise<void>[] = [];
    slice.forEach(page_link => {
      promises.push(getNewspaperInfoWithoutEmail(page_link, browser, results));
    });
    await Promise.all(promises);
  }
  return results;
};

export default async function main() {
  const browser = await puppeteer.launch({
    headless: true,
    // userDataDir: './userData',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--disable-gpu',
    ],
  });
  const state: JobState = {
    browser,
  };
  await start<JobState>(init, state)
    .pipe(processNewspapers)
    .saveAs('newspaper.json')
    .pipe(findEmail)
    .saveAs('newspaper-with-email.csv')
    .run();
  await browser.close();
}
