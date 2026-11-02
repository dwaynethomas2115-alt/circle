/** Coalesce read-only refreshes without sharing results across access scopes. */
export function createScopedRefresh<T>(options: {
  scope(): string | null;
  load(): Promise<T>;
  accept(value: T, scope: string): void;
  reject(error: unknown): void;
  clear(): void;
}) {
  let active = true;
  let generation = 0;
  let flight:
    { scope: string; generation: number; promise: Promise<void> } | undefined;
  function invalidate() {
    generation++;
    flight = undefined;
  }
  return {
    setActive(value: boolean) {
      active = value;
      invalidate();
    },
    refresh(fresh = false): Promise<void> {
      if (fresh) invalidate();
      if (!active) return Promise.resolve();
      const scope = options.scope();
      if (!scope) {
        invalidate();
        options.clear();
        return Promise.resolve();
      }
      if (flight?.scope === scope && flight.generation === generation)
        return flight.promise;
      const requested = ++generation;
      const current = () =>
        active && generation === requested && options.scope() === scope;
      const promise = Promise.resolve()
        .then(options.load)
        .then((value) => {
          if (current()) options.accept(value, scope);
        })
        .catch((error: unknown) => {
          if (current()) options.reject(error);
        })
        .finally(() => {
          if (flight?.promise === promise) flight = undefined;
        });
      flight = { scope, generation: requested, promise };
      return promise;
    },
  };
}
