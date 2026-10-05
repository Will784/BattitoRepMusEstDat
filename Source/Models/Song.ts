import type { AppearanceData, SongData, SongSource } from "../../Shared/Types";

export class Song {
  public localAudioUrl: string | null = null;
  public localCoverUrl: string | null = null;
  public localBackgroundUrl: string | null = null;
  public localFile: File | null = null;

  public constructor(
    public readonly id: string,
    public collectionId: string | null,
    public title: string,
    public artist: string,
    public durationSeconds: number,
    public readonly source: SongSource,
    public readonly sourceRef: string | null,
    public audioFileId: string | null,
    public coverUrl: string | null,
    public coverFileId: string | null,
    public lyrics: string | null,
    public appearance: AppearanceData | null,
    public originalFileName: string | null
  ) {}

  public static fromData(data: SongData): Song {
    return new Song(
      data.id,
      data.collectionId,
      data.title,
      data.artist,
      data.durationSeconds,
      data.source,
      data.sourceRef,
      data.audioFileId,
      data.coverUrl,
      data.coverFileId,
      data.lyrics,
      data.appearance,
      data.originalFileName
    );
  }

  public get audioUrl(): string | null {
    if (this.localAudioUrl !== null) return this.localAudioUrl;
    if (this.audioFileId !== null) return `/api/files/${this.audioFileId}`;
    if (this.source === "url") return this.sourceRef;
    return null;
  }

  public get coverImage(): string | null {
    if (this.localCoverUrl !== null) return this.localCoverUrl;
    if (this.coverFileId !== null) return `/api/files/${this.coverFileId}`;
    return this.coverUrl;
  }

  public get isAnalysable(): boolean {
    return this.source === "upload";
  }

  public get subtitle(): string {
    return this.artist.length > 0 ? this.artist : this.source === "youtube" ? "YouTube" : "Artista desconocido";
  }

  public releaseLocalResources(): void {
    for (const url of [this.localAudioUrl, this.localCoverUrl, this.localBackgroundUrl]) {
      if (url !== null) URL.revokeObjectURL(url);
    }
    this.localAudioUrl = null;
    this.localCoverUrl = null;
    this.localBackgroundUrl = null;
    this.localFile = null;
  }
}
