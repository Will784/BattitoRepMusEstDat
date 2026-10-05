import type { SearchFilter, SearchResultData } from "../../Shared/Types";
import { HttpError } from "../HttpError";

type FetchFunction = (input: string) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;

interface SearchItem {
  id?: { videoId?: string; channelId?: string };
  snippet?: { title?: string; channelTitle?: string; thumbnails?: Record<string, { url?: string }> };
}

interface VideoItem {
  id?: string;
  snippet?: { title?: string; channelTitle?: string; thumbnails?: Record<string, { url?: string }> };
  contentDetails?: { duration?: string };
  status?: { embeddable?: boolean };
}

export function parseIsoDuration(value: string | undefined): number | null {
  if (value === undefined) {
    return null;
  }
  const match = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(value);
  if (match === null) {
    return null;
  }
  const [, days, hours, minutes, seconds] = match;
  return Number(days ?? 0) * 86400 + Number(hours ?? 0) * 3600 + Number(minutes ?? 0) * 60 + Number(seconds ?? 0);
}

export class YouTubeService {
  public constructor(
    private readonly apiKey: string | null,
    private readonly fetchFunction: FetchFunction = (input) => fetch(input)
  ) {}

  public get isConfigured(): boolean {
    return this.apiKey !== null;
  }

  public async search(query: string, filter: SearchFilter): Promise<SearchResultData[]> {
    const key = this.requireKey();
    const parameters = new URLSearchParams({ part: "snippet", q: query, maxResults: "12", key, safeSearch: "moderate" });
    if (filter === "artists") {
      parameters.set("type", "channel");
    } else {
      parameters.set("type", "video");
      parameters.set("videoEmbeddable", "true");
      parameters.set("videoSyndicated", "true");
      if (filter === "songs") {
        parameters.set("videoCategoryId", "10");
      }
    }
    const search = (await this.request(`https://www.googleapis.com/youtube/v3/search?${parameters.toString()}`)) as { items?: SearchItem[] };
    const items = search.items ?? [];
    if (filter === "artists") {
      return items.flatMap((item) => {
        const id = item.id?.channelId;
        if (id === undefined) return [];
        return [
          {
            kind: "channel" as const,
            id,
            title: item.snippet?.title ?? "Canal",
            channelTitle: item.snippet?.channelTitle ?? "",
            thumbnailUrl: this.pickThumbnail(item.snippet?.thumbnails),
            durationSeconds: null
          }
        ];
      });
    }
    const ids = items.flatMap((item) => (item.id?.videoId === undefined ? [] : [item.id.videoId]));
    if (ids.length === 0) {
      return [];
    }
    return this.describeVideos(ids);
  }

  public async describeVideos(ids: string[]): Promise<SearchResultData[]> {
    const key = this.requireKey();
    const parameters = new URLSearchParams({ part: "snippet,contentDetails,status", id: ids.join(","), key });
    const response = (await this.request(`https://www.googleapis.com/youtube/v3/videos?${parameters.toString()}`)) as { items?: VideoItem[] };
    const byId = new Map<string, VideoItem>();
    for (const item of response.items ?? []) {
      if (item.id !== undefined) byId.set(item.id, item);
    }
    const results: SearchResultData[] = [];
    for (const id of ids) {
      const item = byId.get(id);
      if (item === undefined || item.status?.embeddable === false) continue;
      results.push({
        kind: "video",
        id,
        title: item.snippet?.title ?? "Sin título",
        channelTitle: item.snippet?.channelTitle ?? "",
        thumbnailUrl: this.pickThumbnail(item.snippet?.thumbnails),
        durationSeconds: parseIsoDuration(item.contentDetails?.duration)
      });
    }
    return results;
  }

  private pickThumbnail(thumbnails: Record<string, { url?: string }> | undefined): string | null {
    return thumbnails?.["medium"]?.url ?? thumbnails?.["default"]?.url ?? thumbnails?.["high"]?.url ?? null;
  }

  private requireKey(): string {
    if (this.apiKey === null) {
      throw new HttpError(
        503,
        "YouTubeNotConfigured",
        "Falta configurar YOUTUBE_API_KEY. Crea una clave para YouTube Data API v3, agrégala al archivo .env y reinicia Battito."
      );
    }
    return this.apiKey;
  }

  private async request(url: string): Promise<unknown> {
    let response;
    try {
      response = await this.fetchFunction(url);
    } catch {
      throw new HttpError(502, "YouTubeUnavailable", "No pudimos conectar con YouTube. Revisa tu conexión e inténtalo de nuevo.");
    }
    if (!response.ok) {
      if (response.status === 403) {
        throw new HttpError(503, "YouTubeQuota", "YouTube rechazó la solicitud (cuota agotada o clave no válida).");
      }
      throw new HttpError(502, "YouTubeUnavailable", "YouTube devolvió un error. Inténtalo de nuevo más tarde.");
    }
    return response.json();
  }
}
