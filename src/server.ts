import { app } from "./app";
import { env } from "./config/env";
import { startAlertCron } from "./jobs/alertCron";
import { logger } from "./utils/logger";

app.listen(env.port, () => {
  logger.info(`API escuchando en puerto ${env.port} (${env.nodeEnv})`);
  startAlertCron();
});
