export class Emitter<Events extends Record<string, unknown>> {
  private readonly listeners = new Map<keyof Events, Set<(payload: never) => void>>();

  public on<K extends keyof Events>(name: K, listener: (payload: Events[K]) => void): () => void {
    const bucket = this.listeners.get(name) ?? new Set();
    bucket.add(listener as (payload: never) => void);
    this.listeners.set(name, bucket);
    return () => bucket.delete(listener as (payload: never) => void);
  }

  protected emit<K extends keyof Events>(name: K, payload: Events[K]): void {
    for (const listener of [...(this.listeners.get(name) ?? [])]) {
      (listener as (payload: Events[K]) => void)(payload);
    }
  }
}
