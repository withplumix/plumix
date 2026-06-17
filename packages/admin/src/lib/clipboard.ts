// Copy text to the clipboard. A plain string writes directly — the fast,
// synchronous path. A promise means the value still has to be minted (e.g. a
// preview link): Safari only honors a clipboard write inside the originating
// user gesture, and awaiting the mint consumes that activation, so hand
// `ClipboardItem` a pending Blob to register the write synchronously within the
// gesture and let the text resolve afterward. Engines without `ClipboardItem`
// fall back to the (gesture-sensitive) `writeText`.
export async function copyText(text: string | Promise<string>): Promise<void> {
  if (typeof text === "string") {
    await navigator.clipboard.writeText(text);
    return;
  }
  if (typeof ClipboardItem === "function") {
    await navigator.clipboard.write([
      new ClipboardItem({
        "text/plain": text.then(
          (value) => new Blob([value], { type: "text/plain" }),
        ),
      }),
    ]);
    return;
  }
  await navigator.clipboard.writeText(await text);
}
