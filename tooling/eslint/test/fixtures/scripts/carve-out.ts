interface Row {
  readonly id: string;
}

export type Fixture = unknown;

export function readId(row: Row): string {
  return Reflect.get(row, "id");
}
