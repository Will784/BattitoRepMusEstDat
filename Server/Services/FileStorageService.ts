import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { FileRecord, FileRepository } from "../Database/FileRepository";
import { HttpError } from "../HttpError";
import type { FileValidator } from "./FileValidator";

export class FileStorageService {
  public constructor(
    private readonly rootDirectory: string,
    private readonly files: FileRepository,
    private readonly validator: FileValidator
  ) {
    fs.mkdirSync(rootDirectory, { recursive: true });
  }

  public saveImage(userId: string, buffer: Buffer, originalName: string): FileRecord {
    const validated = this.validator.validateImage(buffer, originalName);
    return this.persist(userId, "image", buffer, originalName, validated.mimeType, validated.extension);
  }

  public saveAudio(userId: string, buffer: Buffer, originalName: string): FileRecord {
    const validated = this.validator.validateAudio(buffer, originalName);
    return this.persist(userId, "audio", buffer, originalName, validated.mimeType, validated.extension);
  }

  public resolveOwned(userId: string, fileId: string): FileRecord {
    const record = this.files.findOwned(userId, fileId);
    if (record === null) {
      throw new HttpError(404, "FileNotFound", "No encontramos el archivo solicitado.");
    }
    const absolute = this.absolutePath(record);
    if (!fs.existsSync(absolute)) {
      throw new HttpError(404, "FileNotFound", "No encontramos el archivo solicitado.");
    }
    return record;
  }

  public absolutePath(record: FileRecord): string {
    const resolved = path.resolve(this.rootDirectory, record.storagePath);
    if (!resolved.startsWith(path.resolve(this.rootDirectory) + path.sep)) {
      throw new HttpError(400, "InvalidPath", "Ruta de archivo no válida.");
    }
    return resolved;
  }

  public releaseIfUnused(userId: string, fileIds: Iterable<string>): void {
    for (const fileId of new Set(fileIds)) {
      const record = this.files.findOwned(userId, fileId);
      if (record === null || this.files.isReferenced(userId, fileId)) {
        continue;
      }
      fs.rmSync(this.absolutePath(record), { force: true });
      this.files.delete(fileId);
    }
  }

  private persist(userId: string, kind: "audio" | "image", buffer: Buffer, originalName: string, mimeType: string, extension: string): FileRecord {
    const relative = path.join(userId, `${randomUUID()}.${extension}`);
    const absolute = path.resolve(this.rootDirectory, relative);
    fs.mkdirSync(path.dirname(absolute), { recursive: true });
    fs.writeFileSync(absolute, buffer);
    return this.files.create({
      userId,
      kind,
      originalName: path.basename(originalName).slice(0, 200),
      mimeType,
      sizeBytes: buffer.length,
      storagePath: relative
    });
  }
}
