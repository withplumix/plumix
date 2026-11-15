import type { Page, Response } from "@playwright/test";
import { PNG_1X1 } from "plumix/test/playwright";

const CONFIRM_PATH = "/media/confirm";

function confirmations(page: Page, count: number): Promise<void> {
  return new Promise((resolve, reject) => {
    let left = count;
    const onResponse = (response: Response) => {
      if (!response.url().endsWith(CONFIRM_PATH)) return;
      if (!response.ok()) {
        page.off("response", onResponse);
        reject(
          new Error(
            `Confirming a seeded upload answered ${String(response.status())}.`,
          ),
        );
        return;
      }
      left -= 1;
      if (left > 0) return;
      page.off("response", onResponse);
      resolve();
    };
    page.on("response", onResponse);
  });
}

/**
 * `pnpm verify:admin --seed <count>` runs this on a page of the playground's
 * admin, signed in as an admin: it uploads `count` images through the library.
 */
export default async function seed(
  page: Page,
  count: number,
): Promise<Readonly<Record<string, readonly string[]>>> {
  const names = Array.from(
    { length: count },
    (_, index) => `seed-${String(index + 1)}.png`,
  );
  await page.goto("pages/media");
  const confirmed = confirmations(page, count);
  await page
    .getByTestId("media-library-upload")
    .locator("input[type='file']")
    .setInputFiles(
      names.map((name) => ({ name, mimeType: "image/png", buffer: PNG_1X1 })),
    );
  await confirmed;
  return { media: names };
}
