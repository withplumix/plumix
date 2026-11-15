export function Flash({ onDone }: { onDone: () => void }) {
  setTimeout(onDone, 1000);
  setInterval(onDone, 1000);
  return <span />;
}
