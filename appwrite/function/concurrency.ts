/** Bound independent I/O without launching an entire snapshot's requests at once. */
export const MEDIA_CONCURRENCY = 6;

export async function mapConcurrent<T, R>(
  values: readonly T[],
  limit: number,
  work: (value: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (!Number.isInteger(limit) || limit < 1)
    throw new Error("Concurrency must be a positive integer.");
  const results: R[] = new Array(values.length);
  let cursor = 0;
  let failed = false;
  let failure: unknown;
  await Promise.all(
    Array.from({ length: Math.min(limit, values.length) }, async () => {
      while (!failed) {
        const index = cursor++;
        if (index >= values.length) return;
        try {
          results[index] = await work(values[index], index);
        } catch (cause) {
          if (!failed) failure = cause;
          failed = true;
        }
      }
    }),
  );
  // Drain in-flight work before rejecting; do not schedule more after a failure.
  if (failed) throw failure;
  return results;
}
