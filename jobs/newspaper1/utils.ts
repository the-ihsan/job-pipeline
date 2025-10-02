import { Browser } from 'puppeteer';

export interface NewspaperInfo {
  name: string;
  email: string;
  source: string;
}

export const findEmail = async (results: NewspaperInfo[]) => {
  const parsed: NewspaperInfo[] = [];

  const email_pref = ['news', 'editor', 'info'];

  for (const result of results) {
    // Match all emails
    const emails = result.email.match(/[\w.-]+@[\w.-]+/g);
    if (!emails || emails.length === 0) {
      continue;
    }
    let found = false;
    loop1: for (const email of emails) {
      for (const pref of email_pref) {
        if (email.includes(pref)) {
          parsed.push({
            name: result.name,
            email: email,
            source: result.source,
          });
          found = true;
          break loop1;
        }
      }
    }
    if (!found) {
      parsed.push({
        name: result.name,
        email: emails[0],
        source: result.source,
      });
    }
  }
  return parsed;
};

export const getNewspaperInfoWithoutEmail = async (
  page_link: string,
  browser: Browser,
  results: NewspaperInfo[]
) => {
  const page = await browser.newPage();
  const source = `https://allonlinebanglanewspapers.com/${page_link}`;
  console.log('Getting newspaper info for', source);
  await page.goto(source, {
    waitUntil: 'networkidle0',
  });
  await page.waitForSelector('h3 a');
  const name = await page.evaluate(() => {
    return document.querySelector('h3 a')?.textContent;
  });
  const email = await page.evaluate(() => {
    return document.querySelector('.details')?.textContent;
  });
  await page.close();

  console.log(name, email);

  if (email) {
    results.push({
      name: name || '',
      email,
      source,
    });
  }
};
