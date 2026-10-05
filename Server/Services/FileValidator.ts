import path from "node:path";
import { AcceptedAudioExtensions, AcceptedImageExtensions, MaximumAudioBytes, MaximumImageBytes } from "../../Shared/Constants";
import { HttpError } from "../HttpError";

export interface ValidatedFile {
  mimeType: string;
  extension: string;
}

export class FileValidator {
  public validateImage(buffer: Buffer, originalName: string): ValidatedFile {
    if (buffer.length === 0) {
      throw new HttpError(400, "InvalidImage", "El archivo de imagen está vacío.");
    }
    if (buffer.length > MaximumImageBytes) {
      throw new HttpError(413, "ImageTooLarge", "La imagen supera el tamaño máximo de 8 MB.");
    }
    const extension = this.extensionOf(originalName);
    if (!(AcceptedImageExtensions as readonly string[]).includes(extension)) {
      throw new HttpError(415, "InvalidImage", "Formato de imagen no permitido. Usa PNG, JPG, JPEG o WEBP.");
    }
    if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
      return { mimeType: "image/png", extension: "png" };
    }
    if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
      return { mimeType: "image/jpeg", extension: "jpg" };
    }
    if (buffer.length >= 12 && buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP") {
      return { mimeType: "image/webp", extension: "webp" };
    }
    throw new HttpError(415, "InvalidImage", "El archivo no es una imagen válida.");
  }

  public validateAudio(buffer: Buffer, originalName: string): ValidatedFile {
    if (buffer.length === 0) {
      throw new HttpError(400, "InvalidAudio", "El archivo de audio está vacío.");
    }
    if (buffer.length > MaximumAudioBytes) {
      throw new HttpError(413, "AudioTooLarge", "El audio supera el tamaño máximo de 80 MB.");
    }
    const extension = this.extensionOf(originalName);
    if (!(AcceptedAudioExtensions as readonly string[]).includes(extension)) {
      throw new HttpError(415, "InvalidAudio", "Formato de audio no permitido.");
    }
    const mimeType = this.detectAudio(buffer);
    if (mimeType === null) {
      throw new HttpError(415, "InvalidAudio", "El archivo no es un audio válido.");
    }
    return { mimeType, extension };
  }

  private detectAudio(buffer: Buffer): string | null {
    if (buffer.length < 12) {
      return null;
    }
    const head = buffer.toString("latin1", 0, 4);
    if (head.startsWith("ID3") || (buffer[0] === 0xff && ((buffer[1] ?? 0) & 0xe0) === 0xe0)) {
      return "audio/mpeg";
    }
    if (head === "OggS") return "audio/ogg";
    if (head === "fLaC") return "audio/flac";
    if (head === "RIFF" && buffer.toString("latin1", 8, 12) === "WAVE") return "audio/wav";
    if (buffer.toString("latin1", 4, 8) === "ftyp") return "audio/mp4";
    if (buffer[0] === 0x1a && buffer[1] === 0x45 && buffer[2] === 0xdf && buffer[3] === 0xa3) return "audio/webm";
    return null;
  }

  private extensionOf(name: string): string {
    return path.extname(name).replace(".", "").toLowerCase();
  }
}
