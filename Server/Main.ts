import "dotenv/config";
import { createApplication } from "./Application";
import { loadConfiguration } from "./Configuration";

const configuration = loadConfiguration();
const application = createApplication(configuration);

const server = application.express.listen(configuration.port, () => {
  console.log(`Battito is running on http://localhost:${configuration.port}`);
  if (configuration.youtubeApiKey === null) {
    console.log("YOUTUBE_API_KEY is not set: YouTube search is disabled.");
  }
});

function shutdown(): void {
  server.close(() => {
    application.database.close();
    process.exit(0);
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
