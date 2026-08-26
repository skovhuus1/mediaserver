export interface JobLeaseHeartbeatOptions {
  leaseMs: number;
  intervalMs?: number;
}

export async function withJobLeaseHeartbeat<T>(
  run: () => Promise<T>,
  renew: () => Promise<void>,
  options: JobLeaseHeartbeatOptions,
): Promise<T> {
  const intervalMs = options.intervalMs ?? Math.max(1_000, Math.floor(options.leaseMs / 3));
  let renewal: Promise<void> | null = null;
  let renewalError: unknown = null;

  const heartbeat = () => {
    if (renewal) return;
    renewal = renew()
      .catch((error: unknown) => {
        renewalError = error;
      })
      .finally(() => {
        renewal = null;
      });
  };

  const timer = setInterval(heartbeat, intervalMs);
  try {
    const result = await run();
    if (renewal) await renewal;
    if (renewalError) throw renewalError;
    return result;
  } finally {
    clearInterval(timer);
    if (renewal) await renewal;
  }
}
