import { randomUUID } from "node:crypto";
import type { DatabaseConnection } from "./DatabaseConnection";

export interface UserRecord {
  id: string;
  email: string;
  displayName: string;
  passwordHash: string;
}

export class UserRepository {
  public constructor(private readonly database: DatabaseConnection) {}

  public create(email: string, displayName: string, passwordHash: string): UserRecord {
    const id = randomUUID();
    this.database.handle
      .prepare("INSERT INTO users (id, email, displayName, passwordHash, createdAt) VALUES (?, ?, ?, ?, ?)")
      .run(id, email, displayName, passwordHash, Date.now());
    return { id, email, displayName, passwordHash };
  }

  public findByEmail(email: string): UserRecord | null {
    const row = this.database.handle.prepare("SELECT id, email, displayName, passwordHash FROM users WHERE email = ?").get(email);
    return (row as UserRecord | undefined) ?? null;
  }

  public findById(id: string): UserRecord | null {
    const row = this.database.handle.prepare("SELECT id, email, displayName, passwordHash FROM users WHERE id = ?").get(id);
    return (row as UserRecord | undefined) ?? null;
  }
}
