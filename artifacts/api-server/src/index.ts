import app from "./app";
import { logger } from "./lib/logger";
import { scheduler } from "./lib/auto-scheduler";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");

  // Запускаем автопланировщик: каждые 3 часа проверяем кто стримит
  scheduler.start({
    checkIntervalMs: 3 * 60 * 60 * 1000,        // проверка каждые 3 часа
    minCollectionIntervalMs: 12 * 60 * 60 * 1000, // собирать канал не чаще раз в 12 часов
    messagesPerChannel: 300,
    detectionWindowMs: 30_000,
  });
});
