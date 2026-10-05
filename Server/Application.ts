import path from "node:path";
import cookieParser from "cookie-parser";
import express, { type Express } from "express";
import helmet from "helmet";
import type { Configuration } from "./Configuration";
import { DatabaseConnection } from "./Database/DatabaseConnection";
import { FileRepository } from "./Database/FileRepository";
import { LibraryRepository } from "./Database/LibraryRepository";
import { PreferenceRepository } from "./Database/PreferenceRepository";
import { UserRepository } from "./Database/UserRepository";
import { attachUser } from "./Middleware/Authentication";
import { errorHandler, notFoundHandler } from "./Middleware/ErrorHandler";
import { createAuthenticationRoutes } from "./Routes/AuthenticationRoutes";
import { createLibraryRoutes } from "./Routes/LibraryRoutes";
import { createSearchRoutes } from "./Routes/SearchRoutes";
import { AuthenticationService } from "./Services/AuthenticationService";
import { FileStorageService } from "./Services/FileStorageService";
import { FileValidator } from "./Services/FileValidator";
import { LyricsService } from "./Services/LyricsService";
import { YouTubeService } from "./Services/YouTubeService";

export interface ApplicationServices {
  youtube?: YouTubeService;
  lyrics?: LyricsService;
}

export interface BattitoApplication {
  express: Express;
  database: DatabaseConnection;
}

export function createApplication(configuration: Configuration, overrides: ApplicationServices = {}): BattitoApplication {
  const database = new DatabaseConnection(configuration.databasePath);
  const users = new UserRepository(database);
  const files = new FileRepository(database);
  const library = new LibraryRepository(database);
  const preferences = new PreferenceRepository(database);
  const storage = new FileStorageService(configuration.uploadDirectory, files, new FileValidator());
  const authentication = new AuthenticationService(users, configuration.jwtSecret, configuration.passwordRounds);
  const youtube = overrides.youtube ?? new YouTubeService(configuration.youtubeApiKey);
  const lyrics = overrides.lyrics ?? new LyricsService(database);

  const application = express();
  application.disable("x-powered-by");
  application.set("trust proxy", 1);
  application.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: false,
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "https://www.youtube.com", "https://s.ytimg.com"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", "data:", "blob:", "https:"],
          mediaSrc: ["'self'", "blob:", "https:", "http:", "data:"],
          fontSrc: ["'self'"],
          connectSrc: ["'self'"],
          frameSrc: ["https://www.youtube.com", "https://www.youtube-nocookie.com"],
          objectSrc: ["'none'"],
          baseUri: ["'self'"],
          formAction: ["'self'"],
          frameAncestors: ["'none'"]
        }
      },
      crossOriginEmbedderPolicy: false,
      crossOriginResourcePolicy: { policy: "same-origin" },
      referrerPolicy: { policy: "strict-origin-when-cross-origin" }
    })
  );
  application.use(express.json({ limit: "256kb" }));
  application.use(cookieParser());
  application.use(attachUser(authentication));

  application.get("/api/health", (_request, response) => {
    response.json({ status: "ok", database: database.ping() });
  });
  application.use("/api/auth", createAuthenticationRoutes(authentication, configuration.secureCookies, configuration.rateLimitEnabled));
  application.use("/api", createSearchRoutes(youtube, lyrics, library, configuration.rateLimitEnabled));
  application.use("/api", createLibraryRoutes(library, preferences, storage));
  application.use("/api", notFoundHandler);

  application.use(express.static(configuration.publicDirectory, { index: "Index.html", maxAge: "1h" }));
  application.get(/^(?!\/api\/).*/, (_request, response, next) => {
    response.sendFile(path.join(configuration.publicDirectory, "Index.html"), (error) => {
      if (error) next();
    });
  });
  application.use(errorHandler);

  return { express: application, database };
}
