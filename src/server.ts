import { createServer, Server as HttpServer } from "http";
import mongoose from "mongoose";

import app from "./app";
import { DATABASE_URL, PORT, APP_NAME, MAIL } from "./config";
import { initSocketIO } from "./utils/socket";
import { startScheduler } from "./utils/scheduler";
import { runSeeds } from "./DB";
import { isMailConfigured, verifyMailConnection } from "./utils/sendEmail";

let server: HttpServer;
import dns from "dns";
// Google DNS
// dns.setServers(["8.8.8.8", "8.8.4.4"]);

// Cloudflare DNS
dns.setServers(["1.1.1.1", "1.0.0.1"]);
async function main() {
  try {
    if (!DATABASE_URL) throw new Error("DATABASE_URL is not set in .env");

    const dbStart = Date.now();
    await mongoose.connect(DATABASE_URL, { connectTimeoutMS: 10000 });
    console.log(`✅ MongoDB connected in ${Date.now() - dbStart}ms`);

    server = createServer(app);
    server.listen(PORT, () => {
      console.log(`🚀 ${APP_NAME} running on port ${PORT}`);
    });

    initSocketIO(server);
    startScheduler();

    // Seed baseline documents (super admin, settings pages).
    await runSeeds();

    /*
     * Check the mail credentials on boot rather than discovering a bad app
     * password on the first client who submits a quote. Deliberately not
     * fatal — the API is still useful with mail down, and quotes are stored
     * before they are emailed.
     */
    if (!isMailConfigured()) {
      console.warn(
        "⚠️  Mail is not configured — quotes will save but nothing will be emailed.",
      );
    } else {
      const mailOk = await verifyMailConnection();
      console.log(
        mailOk
          ? `📧 Mail ready via ${MAIL.provider} as ${MAIL.user}`
          : `⚠️  Mail credentials rejected by ${MAIL.host} — nothing will be emailed.`,
      );
    }
  } catch (error) {
    console.error("☠️ Startup failed:", error);
    process.exit(1);
  }
}

main();

process.on("unhandledRejection", (err) => {
  console.error("☠️ Unhandled promise rejection:", err);
  server?.close(() => process.exit(1));
});

process.on("uncaughtException", (error) => {
  console.error("☠️ Uncaught exception:", error);
  server?.close(() => process.exit(1));
});
