import { randomUUID } from "node:crypto";
import type { DatabaseConnection } from "./DatabaseConnection";

export interface FileRecord {
  id: string;
  userId: string;
  kind: "audio" | "image";
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  storagePath: string;
}

export class FileRepository {
  public constructor(private readonly database: DatabaseConnection) {}

  public create(record: Omit<FileRecord, "id">): FileRecord {
    const id = randomUUID();
    this.database.handle
      .prepare("INSERT INTO files (id, userId, kind, originalName, mimeType, sizeBytes, storagePath, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .run(id, record.userId, record.kind, record.originalName, record.mimeType, record.sizeBytes, record.storagePath, Date.now());
    return { id, ...record };
  }

  public findOwned(userId: string, id: string): FileRecord | null {
    const row = this.database.handle.prepare("SELECT * FROM files WHERE id = ? AND userId = ?").get(id, userId);
    return (row as FileRecord | undefined) ?? null;
  }

  public delete(id: string): void {
    this.database.handle.prepare("DELETE FROM files WHERE id = ?").run(id);
  }

  public isReferenced(userId: string, id: string): boolean {
    const handle = this.database.handle;
    const pattern = `%${id}%`;
    const inSongs = handle
      .prepare("SELECT 1 FROM songs WHERE userId = ? AND (audioFileId = ? OR coverFileId = ? OR appearanceJson LIKE ?) LIMIT 1")
      .get(userId, id, id, pattern);
    if (inSongs !== undefined) {
      return true;
    }
    const inCollections = handle.prepare("SELECT 1 FROM collections WHERE userId = ? AND coverFileId = ? LIMIT 1").get(userId, id);
    if (inCollections !== undefined) {
      return true;
    }
    const inPreferences = handle.prepare("SELECT 1 FROM preferences WHERE userId = ? AND appearanceJson LIKE ? LIMIT 1").get(userId, pattern);
    return inPreferences !== undefined;
  }
}
