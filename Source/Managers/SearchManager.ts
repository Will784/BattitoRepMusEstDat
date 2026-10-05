import type { SearchFilter, SearchResponseData, SearchResultData } from "../../Shared/Types";
import { ApiClient } from "../Services/ApiClient";
import type { Collection } from "../Models/Collection";
import type { Song } from "../Models/Song";
import { decodeHtml } from "../Utils/Format";

export type SearchScope = { kind: "web" } | { kind: "collection"; collection: Collection };

export class SearchManager {
  public constructor(private readonly api: ApiClient) {}

  public async searchWeb(query: string, filter: SearchFilter): Promise<SearchResultData[]> {
    const response = await this.api.get<SearchResponseData>(`/search?q=${encodeURIComponent(query)}&filter=${filter}`);
    return response.results.map((result) => ({ ...result, title: decodeHtml(result.title), channelTitle: decodeHtml(result.channelTitle) }));
  }

  public async resolveUrl(url: string): Promise<{ kind: "youtube" | "url"; result: SearchResultData }> {
    return this.api.get(`/resolve?url=${encodeURIComponent(url)}`);
  }

  public searchCollection(collection: Collection, query: string): Song[] {
    const needle = this.normalize(query);
    const matches: Song[] = [];
    if (needle.length === 0) return matches;
    collection.songs.forEachForward((song) => {
      if (this.normalize(`${song.title} ${song.artist}`).includes(needle)) matches.push(song);
    });
    return matches;
  }

  public normalize(value: string): string {
    return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  }
}
