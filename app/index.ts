import { Daemon } from "./src/daemon";

const d = new Daemon();
d.start();

const shutdown = async (signal: string) => {
  console.log(`Received ${signal}, stopping...`);
  await d.stop();
  process.exit(0);
};

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
