import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import type { Theme } from "./subjects.js";
import { assertCaptureEndpoint } from "./capture-browser.js";
import {
  CAPTURE_INSTANT,
  SCREENSHOT_SUBJECTS,
  screenshotPath,
  THEMES,
} from "./subjects.js";

// The images are committed, so where they were rendered has to be the pinned
// container and not whatever machine ran the command. Checked here rather than
// in the config, which the e2e project shares.
assertCaptureEndpoint();

// `ThemeProvider`'s storage key. Pinning it beats driving the theme menu, which
// would put a menu in frame and a transition under the capture.
const THEME_STORAGE_KEY = "plumix-admin-theme";

// A frame that has not appeared by now is a moved test id, not a slow one — the
// subject already waited for its own content.
const FRAME_TIMEOUT = 5_000;

async function pinTheme(page: Page, theme: Theme): Promise<void> {
  await page.addInitScript(
    ([key, value]) => {
      window.localStorage.setItem(key, value);
    },
    [THEME_STORAGE_KEY, theme] as const,
  );
  // Native chrome — scrollbars, form controls — reads the OS preference rather
  // than the class, so it has to be told the same thing.
  await page.emulateMedia({ colorScheme: theme });
}

for (const subject of SCREENSHOT_SUBJECTS) {
  for (const theme of THEMES) {
    test(`${subject.name} (${theme})`, async ({ page }) => {
      await pinTheme(page, theme);
      await page.clock.setFixedTime(CAPTURE_INSTANT);

      await subject.open(page);

      // `ThemeProvider` applies the class from an effect, so this is both the
      // gate against capturing mid-flip and the only thing that would notice if
      // the admin stopped reading that storage key — without it a renamed key
      // yields a light image in the dark file, silently.
      await expect(page.locator("html")).toHaveClass(
        new RegExp(`(^|\\s)${theme}(\\s|$)`),
      );
      // A capture racing the webfont swaps in fallback metrics for one theme
      // and not the other.
      await page.evaluate(() => document.fonts.ready);

      const frame = page.getByTestId(subject.testId);
      // CI runs this capture as a check, so this message has to carry the fix.
      await expect(
        frame,
        `screenshot subject "${subject.name}" could not frame ` +
          `[data-testid="${subject.testId}"] — correct the test id in ` +
          `screenshots/subjects.ts, or restore it in the admin`,
      ).toBeVisible({ timeout: FRAME_TIMEOUT });

      await frame.screenshot({
        path: screenshotPath(subject.name, theme),
        animations: "disabled",
        caret: "hide",
        scale: "device",
      });
    });
  }
}
