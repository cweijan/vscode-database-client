import type { Disposable } from "./contracts";

type EventHandler<Value> = (value: Value) => void;

export class EventBus<Events extends object> {
  private readonly handlers = new Map<
    keyof Events,
    Set<EventHandler<Events[keyof Events]>>
  >();

  public on<Key extends keyof Events>(
    event: Key,
    handler: EventHandler<Events[Key]>,
  ): Disposable {
    const handlers = this.handlers.get(event) ?? new Set();
    handlers.add(handler as EventHandler<Events[keyof Events]>);
    this.handlers.set(event, handlers);
    return {
      dispose: () => handlers.delete(handler as EventHandler<Events[keyof Events]>),
    };
  }

  public emit<Key extends keyof Events>(event: Key, value: Events[Key]): void {
    for (const handler of this.handlers.get(event) ?? []) {
      handler(value);
    }
  }

  public clear(): void {
    this.handlers.clear();
  }
}
