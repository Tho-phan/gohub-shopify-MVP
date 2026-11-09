import { pollPendingGohubOrders } from "./provision.server";

// GoHub docs require polling GET /orders/{code} at >= 15s intervals. Clamp so a
// bad/low GOHUB_POLL_MS (or NaN) can never cause a tight loop or sub-15s polling.
const INTERVAL_MS = Math.max(15000, Number(process.env.GOHUB_POLL_MS) || 20000);

/**
 * Starts the in-process worker that drives GoHub provisioning forward. GoHub
 * sends no callback — an order only provisions when we poll it — so this loop
 * sweeps PENDING orders on an interval. Guarded by a global flag so HMR reloads
 * and repeated imports never spawn a second loop.
 */
export function startGohubPoller(): void {
  const g = globalThis as unknown as { __gohubPollerStarted?: boolean };
  if (g.__gohubPollerStarted) return;
  g.__gohubPollerStarted = true;

  const tick = async (): Promise<void> => {
    try {
      await pollPendingGohubOrders();
    } catch (e) {
      console.error("[gohub] poller tick failed:", (e as Error).message);
    } finally {
      setTimeout(tick, INTERVAL_MS);
    }
  };

  setTimeout(tick, INTERVAL_MS);
  console.log(`[gohub] poller started (every ${INTERVAL_MS}ms)`);
}
