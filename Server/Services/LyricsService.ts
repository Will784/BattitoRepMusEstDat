import type { DatabaseConnection } from "../Database/DatabaseConnection";

type FetchFunction = (input: string, init?: { signal?: AbortSignal }) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;

export class LyricsService {
  public constructor(
    private readonly database: DatabaseConnection,
    private readonly fetchFunction: FetchFunction = (input, init) => fetch(input, init)
  ) {}

  public async find(artist: string, title: string): Promise<string | null> {
    let cleanArtist = this.clean(artist);
    let cleanTitle = this.clean(title);

    if (cleanArtist.length === 0 && cleanTitle.includes(" - ")) {
      const parts = cleanTitle.split(" - ");
      if (parts[0] && parts[1]) {
        cleanArtist = this.clean(parts[0]);
        cleanTitle = this.clean(parts.slice(1).join(" - "));
      }
    }

    if (cleanTitle.length === 0 && cleanArtist.length === 0) {
      return null;
    }

    const cacheKey = `${cleanArtist.toLowerCase()}|${cleanTitle.toLowerCase()}`;
    let cached: { lyrics: string | null; fetchedAt: number } | undefined;
    try {
      cached = this.database.handle.prepare("SELECT lyrics, fetchedAt FROM lyricsCache WHERE cacheKey = ?").get(cacheKey) as
        | { lyrics: string | null; fetchedAt: number }
        | undefined;
    } catch {
      // Handle closed connection gracefully
    }

    const oneDay = 24 * 60 * 60 * 1000;
    if (cached !== undefined && (cached.lyrics !== null || Date.now() - cached.fetchedAt < oneDay)) {
      return cached.lyrics;
    }

    const lyrics = await this.fetchFromProviders(cleanArtist, cleanTitle, title);
    if (lyrics.status === "error") {
      return cached?.lyrics ?? null;
    }

    try {
      this.database.handle
        .prepare("INSERT INTO lyricsCache (cacheKey, lyrics, fetchedAt) VALUES (?, ?, ?) ON CONFLICT(cacheKey) DO UPDATE SET lyrics = excluded.lyrics, fetchedAt = excluded.fetchedAt")
        .run(cacheKey, lyrics.text, Date.now());
    } catch {
      // Handle closed connection gracefully
    }

    return lyrics.text;
  }

  private async fetchFromProviders(artist: string, title: string, originalTitle: string): Promise<{ status: "ok" | "error"; text: string | null }> {
    if (artist.length > 0 && title.length > 0) {
      const lrclibRes = await this.fetchFromLrclib(artist, title);
      if (lrclibRes.text !== null) return lrclibRes;
    }

    if (artist.length > 0 && title.length > 0) {
      const ovhRes = await this.fetchFromOvh(artist, title);
      if (ovhRes.text !== null) return ovhRes;
    }

    const searchQuery = artist.length > 0 ? `${artist} ${title}` : originalTitle;
    const lrclibSearchRes = await this.searchLrclib(searchQuery);
    if (lrclibSearchRes.text !== null) return lrclibSearchRes;

    return { status: "ok", text: null };
  }

  private async fetchFromLrclib(artist: string, title: string): Promise<{ status: "ok" | "error"; text: string | null }> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);
    try {
      const url = `https://lrclib.net/api/get?artist_name=${encodeURIComponent(artist)}&track_name=${encodeURIComponent(title)}`;
      const response = await this.fetchFunction(url, { signal: controller.signal });
      if (response.status === 404) return { status: "ok", text: null };
      if (!response.ok) return { status: "error", text: null };
      const body = (await response.json()) as { plainLyrics?: string; syncedLyrics?: string; lyrics?: string };
      let text: string | null = null;
      if (typeof body.plainLyrics === "string" && body.plainLyrics.trim().length > 0) {
        text = body.plainLyrics.trim();
      } else if (typeof body.syncedLyrics === "string" && body.syncedLyrics.trim().length > 0) {
        text = this.cleanSyncedLyrics(body.syncedLyrics);
      } else if (typeof body.lyrics === "string" && body.lyrics.trim().length > 0) {
        text = body.lyrics.replace(/\r\n/g, "\n").trim();
      }
      return { status: "ok", text };
    } catch {
      return { status: "error", text: null };
    } finally {
      clearTimeout(timer);
    }
  }

  private async searchLrclib(query: string): Promise<{ status: "ok" | "error"; text: string | null }> {
    const cleaned = this.clean(query);
    if (cleaned.length === 0) return { status: "ok", text: null };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);
    try {
      const url = `https://lrclib.net/api/search?q=${encodeURIComponent(cleaned)}`;
      const response = await this.fetchFunction(url, { signal: controller.signal });
      if (!response.ok) return { status: "error", text: null };
      const list = (await response.json()) as Array<{ plainLyrics?: string; syncedLyrics?: string }>;
      if (!Array.isArray(list)) return { status: "ok", text: null };
      for (const item of list) {
        if (typeof item.plainLyrics === "string" && item.plainLyrics.trim().length > 0) {
          return { status: "ok", text: item.plainLyrics.trim() };
        }
        if (typeof item.syncedLyrics === "string" && item.syncedLyrics.trim().length > 0) {
          return { status: "ok", text: this.cleanSyncedLyrics(item.syncedLyrics) };
        }
      }
      return { status: "ok", text: null };
    } catch {
      return { status: "error", text: null };
    } finally {
      clearTimeout(timer);
    }
  }

  private async fetchFromOvh(artist: string, title: string): Promise<{ status: "ok" | "error"; text: string | null }> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);
    try {
      const url = `https://api.lyrics.ovh/v1/${encodeURIComponent(artist)}/${encodeURIComponent(title)}`;
      const response = await this.fetchFunction(url, { signal: controller.signal });
      if (response.status === 404) {
        return { status: "ok", text: null };
      }
      if (!response.ok) {
        return { status: "error", text: null };
      }
      const body = (await response.json()) as { lyrics?: unknown };
      const text = typeof body.lyrics === "string" ? body.lyrics.replace(/\r\n/g, "\n").trim() : "";
      return { status: "ok", text: text.length > 0 ? text : null };
    } catch {
      return { status: "error", text: null };
    } finally {
      clearTimeout(timer);
    }
  }

  private cleanSyncedLyrics(synced: string): string {
    return synced
      .replace(/^\[\d+:\d+\.\d+\]\s*/gm, "")
      .replace(/\r\n/g, "\n")
      .trim();
  }

  private clean(value: string): string {
    return value
      .replace(/\s*-\s*Topic$/i, "")
      .replace(/^[0-9]{1,3}\s*[\.-]?\s*/, "")
      .replace(/\(.*?\)|\[.*?\]/g, " ")
      .replace(/official|video|oficial|lyrics|letra|lyric|audio|hd|4k|vevo|remix|feat\.?|ft\.?/gi, " ")
      .replace(/\s+/g, " ")
      .trim();
  }
}
