import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { HexColorPattern, MaximumAudioBytes, PresetIds, YouTubeVideoIdPattern } from "../../Shared/Constants";
import type { AppearanceData, PreferencesData, UploadedImageData } from "../../Shared/Types";
import { LibraryRepository, OrderMismatchError } from "../Database/LibraryRepository";
import type { PreferenceRepository } from "../Database/PreferenceRepository";
import { HttpError } from "../HttpError";
import { asyncHandler } from "../Middleware/AsyncHandler";
import { currentUser, requireUser } from "../Middleware/Authentication";
import type { FileStorageService } from "../Services/FileStorageService";

const httpUrl = z
  .string()
  .max(2000)
  .refine((value) => {
    try {
      const url = new URL(value);
      return url.protocol === "https:" || url.protocol === "http:";
    } catch {
      return false;
    }
  }, "La dirección no es válida.");

const appearanceSchema = z
  .object({
    mode: z.enum(["default", "color", "preset", "image"]),
    color: z.string().regex(HexColorPattern, "El color no es válido.").optional(),
    presetId: z.enum(PresetIds).optional(),
    fileId: z.string().uuid().optional()
  })
  .superRefine((value, context) => {
    if (value.mode === "color" && value.color === undefined) context.addIssue({ code: "custom", message: "Falta el color." });
    if (value.mode === "preset" && value.presetId === undefined) context.addIssue({ code: "custom", message: "Falta la imagen predeterminada." });
    if (value.mode === "image" && value.fileId === undefined) context.addIssue({ code: "custom", message: "Falta la imagen." });
  });

const songFieldsSchema = z.object({
  title: z.string().trim().min(1, "La canción necesita un título.").max(200),
  artist: z.string().trim().max(200).default(""),
  durationSeconds: z.coerce.number().min(0).max(60 * 60 * 24).default(0),
  collectionId: z.string().uuid().nullable().optional()
});

const remoteSongSchema = songFieldsSchema.extend({
  source: z.enum(["youtube", "url"]),
  sourceRef: z.string().min(1).max(2000),
  coverUrl: httpUrl.nullable().optional()
});

const updateSongSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  artist: z.string().trim().max(200).optional(),
  lyrics: z.string().max(20000).nullable().optional(),
  coverFileId: z.string().uuid().nullable().optional(),
  coverUrl: httpUrl.nullable().optional(),
  appearance: appearanceSchema.nullable().optional(),
  durationSeconds: z.number().min(0).max(60 * 60 * 24).optional()
});

const collectionSchema = z.object({
  kind: z.enum(["folder", "playlist"]),
  name: z.string({ message: "Escribe un nombre." }).trim().min(1, "Escribe un nombre.").max(80, "El nombre es demasiado largo.")
});

const preferencesSchema = z.object({
  theme: z.enum(["light", "dark"]),
  appearance: appearanceSchema
});

const orderSchema = z.object({
  scope: z.enum(["songs", "folders", "playlists", "collection"]),
  collectionId: z.string().uuid().nullable().optional(),
  ids: z.array(z.string().uuid()).max(5000)
});

export function createLibraryRoutes(library: LibraryRepository, preferences: PreferenceRepository, storage: FileStorageService): Router {
  const router = Router();
  router.use(requireUser);
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MaximumAudioBytes, files: 2, fields: 12 } });

  const ensureCollection = (userId: string, collectionId: string | null | undefined): string | null => {
    if (collectionId === undefined || collectionId === null) {
      return null;
    }
    if (library.findCollection(userId, collectionId) === null) {
      throw new HttpError(404, "CollectionNotFound", "No encontramos la carpeta o playlist indicada.");
    }
    return collectionId;
  };

  const ensureOwnedImage = (userId: string, fileId: string | null | undefined): void => {
    if (fileId === undefined || fileId === null) {
      return;
    }
    const record = storage.resolveOwned(userId, fileId);
    if (record.kind !== "image") {
      throw new HttpError(400, "InvalidImage", "El archivo indicado no es una imagen.");
    }
  };

  const ensureOwnedAppearance = (userId: string, appearance: AppearanceData | null | undefined): void => {
    if (appearance?.mode === "image") {
      ensureOwnedImage(userId, appearance.fileId);
    }
  };

  router.get("/library", (request, response) => {
    response.json(library.getLibrary(currentUser(request).id));
  });

  router.post("/collections", (request, response) => {
    const user = currentUser(request);
    const body = collectionSchema.parse(request.body);
    response.status(201).json(library.createCollection(user.id, body.kind, body.name));
  });

  router.patch("/collections/:id", (request, response) => {
    const user = currentUser(request);
    const body = z
      .object({ name: z.string().trim().min(1, "Escribe un nombre.").max(80).optional(), coverFileId: z.string().uuid().nullable().optional() })
      .parse(request.body);
    ensureOwnedImage(user.id, body.coverFileId);
    const before = library.findCollection(user.id, String(request.params["id"]));
    const updated = library.updateCollection(user.id, String(request.params["id"]), body);
    if (updated === null) {
      throw new HttpError(404, "CollectionNotFound", "No encontramos la carpeta o playlist indicada.");
    }
    if (before?.coverFileId && before.coverFileId !== updated.coverFileId) {
      storage.releaseIfUnused(user.id, [before.coverFileId]);
    }
    response.json(updated);
  });

  router.delete("/collections/:id", (request, response) => {
    const user = currentUser(request);
    const candidates = library.deleteCollection(user.id, String(request.params["id"]));
    if (candidates === null) {
      throw new HttpError(404, "CollectionNotFound", "No encontramos la carpeta o playlist indicada.");
    }
    storage.releaseIfUnused(user.id, candidates);
    response.status(204).end();
  });

  router.post(
    "/songs/upload",
    upload.fields([
      { name: "audio", maxCount: 1 },
      { name: "cover", maxCount: 1 }
    ]),
    (request, response) => {
      const user = currentUser(request);
      const files = request.files as Record<string, Express.Multer.File[]> | undefined;
      const audio = files?.["audio"]?.[0];
      if (audio === undefined) {
        throw new HttpError(400, "MissingAudio", "Selecciona un archivo de audio.");
      }
      const fields = songFieldsSchema.parse({ ...request.body, collectionId: request.body?.collectionId || null });
      const collectionId = ensureCollection(user.id, fields.collectionId);
      const audioRecord = storage.saveAudio(user.id, audio.buffer, Buffer.from(audio.originalname, "latin1").toString("utf8"));
      let coverFileId: string | null = null;
      const cover = files?.["cover"]?.[0];
      if (cover !== undefined) {
        coverFileId = storage.saveImage(user.id, cover.buffer, Buffer.from(cover.originalname, "latin1").toString("utf8")).id;
      }
      const song = library.addSong(user.id, {
        collectionId,
        title: fields.title,
        artist: fields.artist,
        durationSeconds: fields.durationSeconds,
        source: "upload",
        sourceRef: null,
        audioFileId: audioRecord.id,
        originalFileName: audioRecord.originalName,
        coverUrl: null,
        coverFileId
      });
      response.status(201).json(song);
    }
  );

  router.post("/songs/remote", (request, response) => {
    const user = currentUser(request);
    const body = remoteSongSchema.parse(request.body);
    if (body.source === "youtube" && !YouTubeVideoIdPattern.test(body.sourceRef)) {
      throw new HttpError(400, "InvalidVideo", "El identificador del video de YouTube no es válido.");
    }
    if (body.source === "url") {
      httpUrl.parse(body.sourceRef);
    }
    const collectionId = ensureCollection(user.id, body.collectionId);
    const song = library.addSong(user.id, {
      collectionId,
      title: body.title,
      artist: body.artist,
      durationSeconds: body.durationSeconds,
      source: body.source,
      sourceRef: body.sourceRef,
      audioFileId: null,
      originalFileName: null,
      coverUrl: body.coverUrl ?? null,
      coverFileId: null
    });
    response.status(201).json(song);
  });

  router.post("/songs/:id/copy", (request, response) => {
    const user = currentUser(request);
    const body = z.object({ collectionId: z.string().uuid().nullable() }).parse(request.body);
    const collectionId = ensureCollection(user.id, body.collectionId);
    const copy = library.copySong(user.id, String(request.params["id"]), collectionId);
    if (copy === null) {
      throw new HttpError(404, "SongNotFound", "No encontramos la canción indicada.");
    }
    response.status(201).json(copy);
  });

  router.patch("/songs/:id", (request, response) => {
    const user = currentUser(request);
    const body = updateSongSchema.parse(request.body);
    ensureOwnedImage(user.id, body.coverFileId);
    ensureOwnedAppearance(user.id, body.appearance);
    const patch = JSON.parse(JSON.stringify(body)) as typeof body;
    const result = library.updateSong(user.id, String(request.params["id"]), patch);
    if (result === null) {
      throw new HttpError(404, "SongNotFound", "No encontramos la canción indicada.");
    }
    storage.releaseIfUnused(user.id, result.released);
    response.json(result.song);
  });

  router.delete("/songs/:id", (request, response) => {
    const user = currentUser(request);
    const candidates = library.deleteSong(user.id, String(request.params["id"]));
    if (candidates === null) {
      throw new HttpError(404, "SongNotFound", "No encontramos la canción indicada.");
    }
    storage.releaseIfUnused(user.id, candidates);
    response.status(204).end();
  });

  router.put("/order", (request, response) => {
    const user = currentUser(request);
    const body = orderSchema.parse(request.body);
    let collectionId: string | null = null;
    if (body.scope === "collection") {
      collectionId = ensureCollection(user.id, body.collectionId);
      if (collectionId === null) {
        throw new HttpError(400, "InvalidRequest", "Falta la carpeta o playlist.");
      }
    }
    try {
      library.updateOrder(user.id, body.scope, body.ids, collectionId);
    } catch (error) {
      if (error instanceof OrderMismatchError) {
        throw new HttpError(409, "OrderMismatch", "El orden enviado no coincide con tu biblioteca. Recarga la página e inténtalo de nuevo.");
      }
      throw error;
    }
    response.status(204).end();
  });

  router.put("/preferences", (request, response) => {
    const user = currentUser(request);
    const body = preferencesSchema.parse(request.body);
    ensureOwnedAppearance(user.id, body.appearance);
    const previous = preferences.get(user.id);
    const normalized = JSON.parse(JSON.stringify(body)) as PreferencesData;
    const saved = preferences.save(user.id, normalized);
    if (previous.appearance.fileId !== undefined && previous.appearance.fileId !== saved.appearance.fileId) {
      storage.releaseIfUnused(user.id, [previous.appearance.fileId]);
    }
    response.json(saved);
  });

  router.post(
    "/images",
    upload.single("image"),
    asyncHandler((request, response) => {
      const user = currentUser(request);
      if (request.file === undefined) {
        throw new HttpError(400, "MissingImage", "Selecciona una imagen.");
      }
      const record = storage.saveImage(user.id, request.file.buffer, Buffer.from(request.file.originalname, "latin1").toString("utf8"));
      const payload: UploadedImageData = { fileId: record.id };
      response.status(201).json(payload);
    })
  );

  router.get("/files/:id", (request, response, next) => {
    try {
      const user = currentUser(request);
      const record = storage.resolveOwned(user.id, String(request.params["id"]));
      response.setHeader("Content-Type", record.mimeType);
      response.setHeader("X-Content-Type-Options", "nosniff");
      response.setHeader("Cache-Control", "private, max-age=3600");
      response.sendFile(storage.absolutePath(record), { headers: { "Content-Type": record.mimeType } }, (error) => {
        if (error !== undefined && error !== null && !response.headersSent) {
          next(new HttpError(404, "FileNotFound", "No encontramos el archivo solicitado."));
        }
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
