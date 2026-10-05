export type ThemeMode = "light" | "dark";
export type SongSource = "upload" | "youtube" | "url";
export type CollectionKind = "folder" | "playlist";
export type AppearanceMode = "default" | "color" | "preset" | "image";
export type OrderScope = "songs" | "folders" | "playlists" | "collection";
export type SearchFilter = "all" | "songs" | "videos" | "artists";

export interface AppearanceData {
  mode: AppearanceMode;
  color?: string;
  presetId?: string;
  fileId?: string;
}

export interface PreferencesData {
  theme: ThemeMode;
  appearance: AppearanceData;
}

export interface SongData {
  id: string;
  collectionId: string | null;
  title: string;
  artist: string;
  durationSeconds: number;
  source: SongSource;
  sourceRef: string | null;
  audioFileId: string | null;
  coverUrl: string | null;
  coverFileId: string | null;
  lyrics: string | null;
  appearance: AppearanceData | null;
  originalFileName: string | null;
}

export interface CollectionData {
  id: string;
  kind: CollectionKind;
  name: string;
  coverFileId: string | null;
  songs: SongData[];
}

export interface LibraryData {
  songs: SongData[];
  folders: CollectionData[];
  playlists: CollectionData[];
  preferences: PreferencesData;
}

export interface UserData {
  id: string;
  email: string;
  displayName: string;
}

export interface SessionData {
  user: UserData;
}

export interface SearchResultData {
  kind: "video" | "channel";
  id: string;
  title: string;
  channelTitle: string;
  thumbnailUrl: string | null;
  durationSeconds: number | null;
}

export interface SearchResponseData {
  results: SearchResultData[];
}

export interface LyricsResponseData {
  lyrics: string | null;
  origin: "custom" | "provider" | "none";
}

export interface UploadedImageData {
  fileId: string;
}

export interface NewRemoteSongData {
  title: string;
  artist: string;
  durationSeconds: number;
  source: "youtube" | "url";
  sourceRef: string;
  coverUrl: string | null;
  collectionId: string | null;
}

export interface UpdateSongData {
  title?: string;
  artist?: string;
  lyrics?: string | null;
  coverFileId?: string | null;
  coverUrl?: string | null;
  appearance?: AppearanceData | null;
  durationSeconds?: number;
}

export interface ApiErrorData {
  message: string;
  code: string;
}
