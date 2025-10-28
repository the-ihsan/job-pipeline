import type { Page } from 'playwright';
import type { JobState } from './state.ts';

export async function getActiveTab(
  state: JobState
): Promise<Page | null> {
  try {
    const pages = state.context.pages();

    if (pages.length === 0) {
      return null;
    }

    if (state.activeTabIndex < pages.length) {
      await pages[state.activeTabIndex].bringToFront();
      return pages[state.activeTabIndex];
    }

    let idx = 0;

    for (const page of pages) {
      idx++;
      try {
        const isFocused = await page.evaluate(() => document.hasFocus());
        if (isFocused) {
          state.activeTabIndex = idx - 1;
          return page;
        }
      } catch (e) {
        continue;
      }
    }

    state.activeTabIndex = pages.length - 1;
    return pages[pages.length - 1];
  } catch (error) {
    console.error('Error getting active page:', error);
    return null;
  }
}

export async function getActiveTabUrl(
  state: JobState
): Promise<string> {
  try {
    const currentTab = await getActiveTab(state);
    if (!currentTab) {
      return 'about:blank';
    }
    return currentTab.url();
  } catch (error) {
    console.error('Error getting active tab URL:', error);
    return 'about:blank';
  }
}

export async function focusNextTab(
  state: JobState
): Promise<void> {
  const pages = state.context.pages();
  if (pages.length === 0) {
    return;
  }
  state.activeTabIndex++;
  if (state.activeTabIndex >= pages.length) {
    state.activeTabIndex = 0;
  }
  const currentTab = pages[state.activeTabIndex];
  await currentTab.bringToFront();
}

export async function focusPrevTab(
  state: JobState
): Promise<void> {
  const pages = state.context.pages();
  if (pages.length === 0) {
    return;
  }
  state.activeTabIndex--;
  if (state.activeTabIndex <= 0) {
    state.activeTabIndex = pages.length - 1;
  }
  const currentTab = pages[state.activeTabIndex];
  await currentTab.bringToFront();
}
