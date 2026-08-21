export function open(message: object): string {
  return String(message);
}

export const send = (message: object): void => {
  void message;
};

export interface Bridge {
  post(message: object): void;
  readonly latest: object;
  readonly onMessage: (message: object) => void;
}

export class Port {
  readonly buffered: object = {};

  receive(message: object = {}): void {
    void message;
  }
}

export class Channel {
  // A constructor parameter property is a parameter and a property at once,
  // and it can carry a default on top of that.
  constructor(
    private readonly inbox: object,
    private outbox: object = {},
  ) {}

  peek(): string {
    return String(this.inbox) + String(this.outbox);
  }
}
