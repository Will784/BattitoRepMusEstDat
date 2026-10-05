import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

export class DatabaseConnection {
  public readonly handle: Database.Database;

  public constructor(databasePath: string) {
    if (databasePath !== ":memory:") {
      fs.mkdirSync(path.dirname(databasePath), { recursive: true });
    }
    this.handle = new Database(databasePath);
    this.handle.pragma("journal_mode = WAL");
    this.handle.pragma("foreign_keys = ON");
    this.migrate();
  }

  public close(): void {
    this.handle.close();
  }

  public ping(): boolean {
    const row = this.handle.prepare("SELECT 1 AS alive").get() as { alive: number };
    return row.alive === 1;
  }

  private migrate(): void {
    this.handle.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        displayName TEXT NOT NULL,
        passwordHash TEXT NOT NULL,
        createdAt INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS files (
        id TEXT PRIMARY KEY,
        userId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        kind TEXT NOT NULL CHECK (kind IN ('audio','image')),
        originalName TEXT NOT NULL,
        mimeType TEXT NOT NULL,
        sizeBytes INTEGER NOT NULL,
        storagePath TEXT NOT NULL,
        createdAt INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS filesByUser ON files(userId);
      CREATE TABLE IF NOT EXISTS collections (
        id TEXT PRIMARY KEY,
        userId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        kind TEXT NOT NULL CHECK (kind IN ('folder','playlist')),
        name TEXT NOT NULL,
        position INTEGER NOT NULL,
        coverFileId TEXT,
        createdAt INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS collectionsByUser ON collections(userId, kind, position);
      CREATE TABLE IF NOT EXISTS songs (
        id TEXT PRIMARY KEY,
        userId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        collectionId TEXT REFERENCES collections(id) ON DELETE CASCADE,
        position INTEGER NOT NULL,
        title TEXT NOT NULL,
        artist TEXT NOT NULL,
        durationSeconds REAL NOT NULL,
        source TEXT NOT NULL CHECK (source IN ('upload','youtube','url')),
        sourceRef TEXT,
        audioFileId TEXT,
        originalFileName TEXT,
        coverUrl TEXT,
        coverFileId TEXT,
        lyrics TEXT,
        appearanceJson TEXT,
        createdAt INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS songsByUser ON songs(userId, collectionId, position);
      CREATE TABLE IF NOT EXISTS preferences (
        userId TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        theme TEXT NOT NULL,
        appearanceJson TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS lyricsCache (
        cacheKey TEXT PRIMARY KEY,
        lyrics TEXT,
        fetchedAt INTEGER NOT NULL
      );
    `);
  }
}
