import path from "node:path";

export interface Configuration {
  port: number;
  databasePath: string;
  uploadDirectory: string;
  publicDirectory: string;
  jwtSecret: string;
  youtubeApiKey: string | null;
  secureCookies: boolean;
  passwordRounds: number;
  rateLimitEnabled: boolean;
}

export function loadConfiguration(environment: NodeJS.ProcessEnv = process.env): Configuration {
  const jwtSecret = environment["JWT_SECRET"] ?? "";
  if (jwtSecret.length < 32) {
    throw new Error("JWT_SECRET must be defined with at least 32 characters. Copy EnvironmentExample to .env and set it.");
  }
  const root = process.cwd();
  const youtubeApiKey = (environment["YOUTUBE_API_KEY"] ?? "").trim();
  return {
    port: Number(environment["PORT"] ?? 3000),
    databasePath: path.resolve(root, environment["DATABASE_PATH"] ?? "Data/Battito.sqlite"),
    uploadDirectory: path.resolve(root, environment["UPLOAD_DIRECTORY"] ?? "Data/Uploads"),
    publicDirectory: path.resolve(root, environment["PUBLIC_DIRECTORY"] ?? "Dist/Public"),
    jwtSecret,
    youtubeApiKey: youtubeApiKey.length > 0 ? youtubeApiKey : null,
    secureCookies: environment["SECURE_COOKIES"] === "true",
    passwordRounds: Number(environment["PASSWORD_ROUNDS"] ?? 12),
    rateLimitEnabled: environment["RATE_LIMIT"] !== "false"
  };
}
