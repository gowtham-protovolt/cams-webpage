import { reconcileActiveMachineTickets } from "./service.js";

let running = false;

export function startTicketMonitor(intervalMs = 30_000) {
  const run = async () => {
    if (running) return;
    running = true;
    try {
      await reconcileActiveMachineTickets();
    } catch (error) {
      console.error("CAMS ticket monitor failed.", error.message);
    } finally {
      running = false;
    }
  };
  run();
  return setInterval(run, intervalMs);
}

export function stopTicketMonitor(timer) {
  if (timer) clearInterval(timer);
}
