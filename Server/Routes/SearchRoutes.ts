import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { YouTubeVideoIdPattern } from "../../Shared/Constants";
import type { LyricsResponseData, SearchResponseData, SearchResultData } from "../../Shared/Types";
import type { LibraryRepository } from "../Database/LibraryRepository";
import { HttpError } from "../HttpError";
import { asyncHandler } from "../Middleware/AsyncHandler";
import type { LyricsService } from "../Services/LyricsService";
import type { YouTubeService } from "../Services/YouTubeService";

const searchSchema = z.object({
  q: z.string().trim().min(1, "Escribe qué quieres buscar.").max(120),
  filter: z.enum(["all", "songs", "videos", "artists"]).default("all")
});

export function extractVideoId(input: string): string | null {
  try {
    const url = new URL(input);
    const host = url.hostname.replace(/^www\./, "").replace(/^m\./, "");
    let candidate: string | null = null;
    if (host === "youtu.be") {
      candidate = url.pathname.split("/")[1] ?? null;
    } else if (host === "youtube.com" || host === "music.youtube.com" || host === "youtube-nocookie.com") {
      if (url.pathname === "/watch") {
        candidate = url.searchParams.get("v");
      } else {
        const parts = url.pathname.split("/");
        if (parts[1] === "embed" || parts[1] === "shorts" || parts[1] === "live") {
          candidate = parts[2] ?? null;
        }
      }
    }
    return candidate !== null && YouTubeVideoIdPattern.test(candidate) ? candidate : null;
  } catch {
    return null;
  }
}

export function createSearchRoutes(youtube: YouTubeService, lyrics: LyricsService, library: LibraryRepository, rateLimitEnabled: boolean): Router {
  const router = Router();
  const limiter = rateLimit({
    windowMs: 60 * 1000,
    limit: 60,
    standardHeaders: true,
    legacyHeaders: false,
    skip: () => !rateLimitEnabled,
    message: { code: "TooManyRequests", message: "Demasiadas búsquedas seguidas. Espera un momento." }
  });

  router.get(
    "/search",
    limiter,
    asyncHandler(async (request, response) => {
      const query = searchSchema.parse(request.query);
      const results = await youtube.search(query.q, query.filter);
      const payload: SearchResponseData = { results };
      response.json(payload);
    })
  );

  router.get(
    "/resolve",
    limiter,
    asyncHandler(async (request, response) => {
      const { url } = z.object({ url: z.string().trim().min(1, "Pega una dirección.").max(2000) }).parse(request.query);
      const videoId = extractVideoId(url);
      if (videoId !== null) {
        const [result] = await youtube.describeVideos([videoId]);
        if (result === undefined) {
          throw new HttpError(404, "VideoUnavailable", "Ese video no está disponible para reproducirse en Battito.");
        }
        response.json({ kind: "youtube", result });
        return;
      }
      let parsed: URL;
      try {
        parsed = new URL(url);
      } catch {
        throw new HttpError(400, "InvalidUrl", "La dirección no es válida.");
      }
      if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
        throw new HttpError(400, "InvalidUrl", "La dirección no es válida.");
      }
      const fileName = decodeURIComponent(parsed.pathname.split("/").pop() ?? "").replace(/\.[a-z0-9]+$/i, "");
      const result: SearchResultData = {
        kind: "video",
        id: parsed.toString(),
        title: fileName.length > 0 ? fileName : parsed.hostname,
        channelTitle: parsed.hostname,
        thumbnailUrl: null,
        durationSeconds: null
      };
      response.json({ kind: "url", result });
    })
  );

  router.get(
    "/lyrics",
    limiter,
    asyncHandler(async (request, response) => {
      const query = z
        .object({
          artist: z.string().trim().max(200).default(""),
          title: z.string().trim().min(1).max(200),
          songId: z.string().uuid().optional()
        })
        .parse(request.query);
      if (query.songId !== undefined && request.user !== undefined) {
        const song = library.findSong(request.user.id, query.songId);
        if (song?.lyrics) {
          const payload: LyricsResponseData = { lyrics: song.lyrics, origin: "custom" };
          response.json(payload);
          return;
        }
      }
      const found = await lyrics.find(query.artist, query.title);
      const payload: LyricsResponseData = found === null ? { lyrics: null, origin: "none" } : { lyrics: found, origin: "provider" };
      response.json(payload);
    })
  );

  return router;
}
