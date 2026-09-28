interface MessageDescriptor {
  readonly id: string;
  readonly message?: string;
}

export function descriptor(value: MessageDescriptor): string {
  return value.message ?? "";
}

export function logged(err: Error): void {
  console.error(err.message);
}

export function boundary(err: Error): string {
  // Shown verbatim: a render boundary has nothing else to name what threw.
  const detail = err.message;
  return detail;
}
