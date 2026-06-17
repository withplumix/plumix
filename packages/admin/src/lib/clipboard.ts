// Safari only honors a clipboard write inside the originating user gesture, and
// awaiting first (e.g. minting a link) consumes that activation. Handing
// `ClipboardItem` a pending Blob registers the write synchronously within the
// gesture and lets the text resolve afterward. Engines without `ClipboardItem`
// fall back to the (gesture-sensitive) `writeText`. Accepts a plain string or a
// promise so callers that must mint the value can still stay within the gesture.
export async function copyText(text: string | Promise<string>): Promise<void> {
  const textPromise = Promise.resolve(text);
  if (typeof ClipboardItem === "function") {
    await navigator.clipboard.write([
      new ClipboardItem({
        "text/plain": textPromise.then(
          (value) => new Blob([value], { type: "text/plain" }),
        ),
      }),
    ]);
    return;
  }
  await navigator.clipboard.writeText(await textPromise);
}
