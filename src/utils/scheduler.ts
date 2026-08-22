import cron from "node-cron";

/**
 * Registers background jobs. Called once from server.ts after the HTTP server
 * starts. Add jobs here — cron keeps running for the life of the process, so
 * they survive restarts in a way `setTimeout` does not.
 *
 * Example:
 *   cron.schedule("0 3 * * *", async () => {
 *     await SomeService.nightlyCleanup();
 *   });
 */
export const startScheduler = () => {
  // Hourly heartbeat — replace with real jobs, or delete this block.
  cron.schedule("0 * * * *", () => {
    console.log(`⏰ Scheduler heartbeat: ${new Date().toISOString()}`);
  });

  console.log("⏰ Scheduler started.");
};
