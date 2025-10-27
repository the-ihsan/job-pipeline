import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import type { Browser } from 'puppeteer';
import { chromium } from 'playwright';
import type { Browser as PlaywrightBrowser, BrowserContext } from 'playwright';

puppeteer.use(StealthPlugin());

export interface BrowserConfig {
  headless?: boolean;
  userDataDir?: string;
  args?: string[];
}

export const defaultBrowserConfig: BrowserConfig = {
  headless: false, // Start with false for debugging
  args: [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-accelerated-2d-canvas',
    '--no-first-run',
    '--no-zygote',
    '--disable-gpu',
    '--disable-web-security',
    '--disable-features=VizDisplayCompositor',
  ],
};

export async function createBrowser(config: BrowserConfig = defaultBrowserConfig): Promise<Browser> {
  console.log('🚀 Launching browser...');
  
  const browser = await puppeteer.launch({
    headless: config.headless ?? defaultBrowserConfig.headless,
    userDataDir: config.userDataDir,
    args: config.args ?? defaultBrowserConfig.args,
  });

  console.log('✅ Browser launched successfully');
  return browser;
}

export async function createBrowserWithPage(config: BrowserConfig = defaultBrowserConfig) {
  const browser = await createBrowser(config);
  const page = await browser.newPage();
  
  // Set viewport and user agent
  await page.setViewport({ width: 1280, height: 720 });
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

  return { browser, page };
}

export interface ChromeConnection {
  browser: PlaywrightBrowser;
  context: BrowserContext;
}

export async function connectToBrowser(debuggingPort: number = 9222): Promise<ChromeConnection> {
  console.log(`🔗 Connecting to Chrome on port ${debuggingPort}...`);
  
  try {
    // Chrome uses a different CDP endpoint structure
    // Try to connect using the Chrome-specific CDP endpoint
    const browser = await chromium.connectOverCDP(`http://localhost:${debuggingPort}`);
    
    // Get the default context (or create one if none exists)
    const contexts = browser.contexts();
    let context: BrowserContext;
    
    if (contexts.length > 0) {
      context = contexts[0];
      console.log('✅ Connected to existing Chrome context');
    } else {
      context = await browser.newContext();
      console.log('✅ Created new Chrome context');
    }
    
    return { browser, context };
  } catch (error) {
    console.error(`❌ Failed to connect to Chrome on port ${debuggingPort}:`, error);
    console.log('\n💡 Chrome remote debugging setup:');
    console.log('   1. Close all Chrome instances');
    console.log('   2. Start Chrome with: chrome --remote-debugging-port=9222');
    console.log('   3. Make sure Chrome is fully loaded before running the script');
    console.log('\n   Alternative: Try using Chrome instead:');
    console.log('   google-chrome --remote-debugging-port=9222');
    throw error;
  }
}
