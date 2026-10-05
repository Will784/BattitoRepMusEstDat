import { randomUUID } from "node:crypto";
import type { AppearanceData, CollectionData, CollectionKind, LibraryData, OrderScope, SongData, SongSource, UpdateSongData } from "../../Shared/Types";
import type { DatabaseConnection } from "./DatabaseConnection";
import { PreferenceRepository } from "./PreferenceRepository";

interface SongRow {
  id: string;
  collectionId: string | null;
  title: string;
  artist: string;
  durationSeconds: number;
  source: SongSource;
  sourceRef: string | null;
  audioFileId: string | null;
  originalFileName: string | null;
  coverUrl: string | null;
  coverFileId: string | null;
  lyrics: string | null;
  appearanceJson: string | null;
}

interface CollectionRow {
  id: string;
  kind: CollectionKind;
  name: string;
  coverFileId: string | null;
}

export interface NewSongRecord {
  collectionId: string | null;
  title: string;
  artist: string;
  durationSeconds: number;
  source: SongSource;
  sourceRef: string | null;
  audioFileId: string | null;
  originalFileName: string | null;
  coverUrl: string | null;
  coverFileId: string | null;
}

export class OrderMismatchError extends Error {}

export class LibraryRepository {
  private readonly preferences: PreferenceRepository;

  public constructor(private readonly database: DatabaseConnection) {
    this.preferences = new PreferenceRepository(database);
  }

  public getLibrary(userId: string): LibraryData {
    const handle = this.database.handle;
    const songRows = handle.prepare("SELECT * FROM songs WHERE userId = ? ORDER BY position ASC, createdAt ASC").all(userId) as SongRow[];
    const collectionRows = handle
      .prepare("SELECT id, kind, name, coverFileId FROM collections WHERE userId = ? ORDER BY position ASC, createdAt ASC")
      .all(userId) as CollectionRow[];
    const looseSongs: SongData[] = [];
    const songsByCollection = new Map<string, SongData[]>();
    for (const row of songRows) {
      const song = this.mapSong(row);
      if (row.collectionId === null) {
        looseSongs.push(song);
      } else {
        const bucket = songsByCollection.get(row.collectionId) ?? [];
        bucket.push(song);
        songsByCollection.set(row.collectionId, bucket);
      }
    }
    const folders: CollectionData[] = [];
    const playlists: CollectionData[] = [];
    for (const row of collectionRows) {
      const collection: CollectionData = { ...row, songs: songsByCollection.get(row.id) ?? [] };
      (row.kind === "folder" ? folders : playlists).push(collection);
    }
    return { songs: looseSongs, folders, playlists, preferences: this.preferences.get(userId) };
  }

  public createCollection(userId: string, kind: CollectionKind, name: string): CollectionData {
    const id = randomUUID();
    const handle = this.database.handle;
    const next = handle.prepare("SELECT COALESCE(MAX(position), -1) + 1 AS next FROM collections WHERE userId = ? AND kind = ?").get(userId, kind) as {
      next: number;
    };
    handle.prepare("INSERT INTO collections (id, userId, kind, name, position, coverFileId, createdAt) VALUES (?, ?, ?, ?, ?, NULL, ?)").run(
      id,
      userId,
      kind,
      name,
      next.next,
      Date.now()
    );
    return { id, kind, name, coverFileId: null, songs: [] };
  }

  public findCollection(userId: string, id: string): CollectionData | null {
    const row = this.database.handle.prepare("SELECT id, kind, name, coverFileId FROM collections WHERE id = ? AND userId = ?").get(id, userId) as
      | CollectionRow
      | undefined;
    if (row === undefined) {
      return null;
    }
    return { ...row, songs: this.listCollectionSongs(userId, id) };
  }

  public updateCollection(userId: string, id: string, patch: { name?: string; coverFileId?: string | null }): CollectionData | null {
    const current = this.findCollection(userId, id);
    if (current === null) {
      return null;
    }
    const name = patch.name ?? current.name;
    const coverFileId = patch.coverFileId === undefined ? current.coverFileId : patch.coverFileId;
    this.database.handle.prepare("UPDATE collections SET name = ?, coverFileId = ? WHERE id = ? AND userId = ?").run(name, coverFileId, id, userId);
    return { ...current, name, coverFileId };
  }

  public deleteCollection(userId: string, id: string): string[] | null {
    const current = this.findCollection(userId, id);
    if (current === null) {
      return null;
    }
    const candidates = new Set<string>();
    for (const song of current.songs) {
      this.collectFileIds(song, candidates);
    }
    if (current.coverFileId !== null) {
      candidates.add(current.coverFileId);
    }
    this.database.handle.prepare("DELETE FROM collections WHERE id = ? AND userId = ?").run(id, userId);
    return [...candidates];
  }

  public findSong(userId: string, id: string): SongData | null {
    const row = this.database.handle.prepare("SELECT * FROM songs WHERE id = ? AND userId = ?").get(id, userId) as SongRow | undefined;
    return row === undefined ? null : this.mapSong(row);
  }

  public listCollectionSongs(userId: string, collectionId: string): SongData[] {
    const rows = this.database.handle
      .prepare("SELECT * FROM songs WHERE userId = ? AND collectionId = ? ORDER BY position ASC, createdAt ASC")
      .all(userId, collectionId) as SongRow[];
    return rows.map((row) => this.mapSong(row));
  }

  public addSong(userId: string, record: NewSongRecord): SongData {
    const id = randomUUID();
    const handle = this.database.handle;
    const next = handle
      .prepare("SELECT COALESCE(MAX(position), -1) + 1 AS next FROM songs WHERE userId = ? AND collectionId IS ?")
      .get(userId, record.collectionId) as { next: number };
    handle
      .prepare(
        `INSERT INTO songs (id, userId, collectionId, position, title, artist, durationSeconds, source, sourceRef, audioFileId, originalFileName, coverUrl, coverFileId, lyrics, appearanceJson, createdAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?)`
      )
      .run(
        id,
        userId,
        record.collectionId,
        next.next,
        record.title,
        record.artist,
        record.durationSeconds,
        record.source,
        record.sourceRef,
        record.audioFileId,
        record.originalFileName,
        record.coverUrl,
        record.coverFileId,
        Date.now()
      );
    const created = this.findSong(userId, id);
    if (created === null) {
      throw new Error("Song insertion failed");
    }
    return created;
  }

  public copySong(userId: string, songId: string, collectionId: string | null): SongData | null {
    const original = this.findSong(userId, songId);
    if (original === null) {
      return null;
    }
    const copy = this.addSong(userId, {
      collectionId,
      title: original.title,
      artist: original.artist,
      durationSeconds: original.durationSeconds,
      source: original.source,
      sourceRef: original.sourceRef,
      audioFileId: original.audioFileId,
      originalFileName: original.originalFileName,
      coverUrl: original.coverUrl,
      coverFileId: original.coverFileId
    });
    const patched = this.updateSong(userId, copy.id, { lyrics: original.lyrics, appearance: original.appearance });
    return patched === null ? copy : patched.song;
  }

  public updateSong(userId: string, id: string, patch: UpdateSongData): { song: SongData; released: string[] } | null {
    const current = this.findSong(userId, id);
    if (current === null) {
      return null;
    }
    const released: string[] = [];
    const next: SongData = { ...current };
    if (patch.title !== undefined) next.title = patch.title;
    if (patch.artist !== undefined) next.artist = patch.artist;
    if (patch.durationSeconds !== undefined) next.durationSeconds = patch.durationSeconds;
    if (patch.lyrics !== undefined) next.lyrics = patch.lyrics;
    if (patch.coverUrl !== undefined) next.coverUrl = patch.coverUrl;
    if (patch.coverFileId !== undefined) {
      if (current.coverFileId !== null && current.coverFileId !== patch.coverFileId) {
        released.push(current.coverFileId);
      }
      next.coverFileId = patch.coverFileId;
    }
    if (patch.appearance !== undefined) {
      if (current.appearance?.fileId !== undefined && current.appearance.fileId !== patch.appearance?.fileId) {
        released.push(current.appearance.fileId);
      }
      next.appearance = patch.appearance;
    }
    this.database.handle
      .prepare(
        "UPDATE songs SET title = ?, artist = ?, durationSeconds = ?, lyrics = ?, coverUrl = ?, coverFileId = ?, appearanceJson = ? WHERE id = ? AND userId = ?"
      )
      .run(
        next.title,
        next.artist,
        next.durationSeconds,
        next.lyrics,
        next.coverUrl,
        next.coverFileId,
        next.appearance === null ? null : JSON.stringify(next.appearance),
        id,
        userId
      );
    return { song: next, released };
  }

  public deleteSong(userId: string, id: string): string[] | null {
    const current = this.findSong(userId, id);
    if (current === null) {
      return null;
    }
    this.database.handle.prepare("DELETE FROM songs WHERE id = ? AND userId = ?").run(id, userId);
    const candidates = new Set<string>();
    this.collectFileIds(current, candidates);
    return [...candidates];
  }

  public updateOrder(userId: string, scope: OrderScope, ids: string[], collectionId: string | null): void {
    const handle = this.database.handle;
    let existing: string[];
    let update: (id: string, position: number) => void;
    if (scope === "songs" || scope === "collection") {
      const container = scope === "songs" ? null : collectionId;
      existing = (
        handle.prepare("SELECT id FROM songs WHERE userId = ? AND collectionId IS ? ORDER BY position ASC").all(userId, container) as { id: string }[]
      ).map((row) => row.id);
      const statement = handle.prepare("UPDATE songs SET position = ? WHERE id = ? AND userId = ?");
      update = (id, position) => void statement.run(position, id, userId);
    } else {
      const kind: CollectionKind = scope === "folders" ? "folder" : "playlist";
      existing = (
        handle.prepare("SELECT id FROM collections WHERE userId = ? AND kind = ? ORDER BY position ASC").all(userId, kind) as { id: string }[]
      ).map((row) => row.id);
      const statement = handle.prepare("UPDATE collections SET position = ? WHERE id = ? AND userId = ?");
      update = (id, position) => void statement.run(position, id, userId);
    }
    const expected = new Set(existing);
    const provided = new Set(ids);
    if (provided.size !== ids.length || expected.size !== provided.size || ![...provided].every((id) => expected.has(id))) {
      throw new OrderMismatchError("The submitted order does not match the stored items");
    }
    const transaction = handle.transaction(() => {
      ids.forEach((id, index) => update(id, index));
    });
    transaction();
  }

  private collectFileIds(song: SongData, target: Set<string>): void {
    if (song.audioFileId !== null) target.add(song.audioFileId);
    if (song.coverFileId !== null) target.add(song.coverFileId);
    if (song.appearance?.fileId !== undefined) target.add(song.appearance.fileId);
  }

  private mapSong(row: SongRow): SongData {
    return {
      id: row.id,
      collectionId: row.collectionId,
      title: row.title,
      artist: row.artist,
      durationSeconds: row.durationSeconds,
      source: row.source,
      sourceRef: row.sourceRef,
      audioFileId: row.audioFileId,
      coverUrl: row.coverUrl,
      coverFileId: row.coverFileId,
      lyrics: row.lyrics,
      appearance: row.appearanceJson === null ? null : (JSON.parse(row.appearanceJson) as AppearanceData),
      originalFileName: row.originalFileName
    };
  }
}
