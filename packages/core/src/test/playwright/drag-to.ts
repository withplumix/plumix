import type { Locator, Page } from "@playwright/test";
import { expect } from "@playwright/test";

interface DragToBox {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

interface DragToPoint {
  readonly x: number;
  readonly y: number;
}

export interface DragToOptions {
  /** Where to press, from the top-left of the source's box; its centre by default. */
  readonly sourcePosition?: (box: DragToBox) => DragToPoint;
  /** Where to release, from the top-left of the target's box; may fall outside it. */
  readonly targetPosition?: (box: DragToBox) => DragToPoint;
  /** The intermediate moves on the way to the target; 10 by default. */
  readonly steps?: number;
  /** Runs at the target with the button still held, to assert the drag is live. */
  readonly beforeDrop?: () => Promise<void>;
}

/**
 * Drives `page.mouse` from the source to the target once both boxes have
 * stopped moving, so a drag never aims at a re-rendering element. It does not
 * scroll either into view.
 */
export async function dragTo(
  page: Page,
  source: Locator,
  target: Locator,
  options: DragToOptions = {},
): Promise<void> {
  const [sourceBox, targetBox] = await settledBoxes(source, target);
  const from = pointIn(sourceBox, options.sourcePosition ?? centre);
  const to = pointIn(targetBox, options.targetPosition ?? centre);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: options.steps ?? 10 });
  await options.beforeDrop?.();
  await page.mouse.up();
}

async function settledBoxes(
  source: Locator,
  target: Locator,
): Promise<[DragToBox, DragToBox]> {
  let previous: (DragToBox | null)[] = [null, null];
  await expect(async () => {
    const boxes = await Promise.all([
      source.boundingBox(),
      target.boundingBox(),
    ]);
    const [lastSource, lastTarget] = previous;
    previous = boxes;
    expect(boxes[0]).not.toBeNull();
    expect(boxes[1]).not.toBeNull();
    expect(boxes).toEqual([lastSource, lastTarget]);
  }).toPass();
  return previous as [DragToBox, DragToBox];
}

function centre(box: DragToBox): DragToPoint {
  return { x: box.width / 2, y: box.height / 2 };
}

function pointIn(
  box: DragToBox,
  position: (box: DragToBox) => DragToPoint,
): DragToPoint {
  const offset = position(box);
  return { x: box.x + offset.x, y: box.y + offset.y };
}
