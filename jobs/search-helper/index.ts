import { start, waitForInput } from '../../utils/index.ts';
import puppeteer from 'puppeteer-extra';
import type { Browser } from 'puppeteer';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import open from 'open';

puppeteer.use(StealthPlugin());

interface JobState {
  browser: Browser;
}

const init = async ({ browser }: JobState) => {
  const page = await browser.newPage();
  const mainurl = 'https://www.allbanglanewspaper.xyz/';
  console.log('Waiting for page to load...');
  await page.goto(mainurl, {
    waitUntil: 'networkidle0',
  });

  await page.waitForSelector('#main_body55');

  const names: string[] = [];

  await page.exposeFunction('push_name', (name: string) => {
    if (name) {
      names.push(name);
    }
  });

  await page.evaluate(() => {
    const main_body = document.getElementById('main_body55')!;
    const newspapers = main_body.children[0].querySelectorAll('.allbanglanewspaperslogo');
    console.log('Found', newspapers.length, 'newspapers');

    for (let i = 0; i < newspapers.length; i++) {
      const newspaper = newspapers[i];
      const name = newspaper.querySelector('.banglanewspaperlistname')?.textContent;
      // @ts-ignore
      window.push_name(name);
    }
  });
  await page.close();
  console.log('Found', names.length, 'neawspapers');
  return names;
};

const processSlice = async (urls: string[]) => {
    urls.forEach(name => {
        open(`https://www.google.com/search?q=${name} email`);
    });
    await waitForInput('Press Enter to continue...');
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
    .pipeSliced(processSlice, 5)
    .run();
  await browser.close();
}
