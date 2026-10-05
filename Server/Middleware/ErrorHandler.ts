import type { NextFunction, Request, Response } from "express";
import multer from "multer";
import { ZodError } from "zod";
import { HttpError } from "../HttpError";

export function notFoundHandler(_request: Request, response: Response): void {
  response.status(404).json({ code: "NotFound", message: "Recurso no encontrado." });
}

export function errorHandler(error: unknown, _request: Request, response: Response, _next: NextFunction): void {
  if (error instanceof HttpError) {
    response.status(error.status).json({ code: error.code, message: error.message });
    return;
  }
  if (error instanceof ZodError) {
    const first = error.issues[0];
    response.status(400).json({ code: "InvalidRequest", message: first?.message ?? "Los datos enviados no son válidos." });
    return;
  }
  if (error instanceof multer.MulterError) {
    if (error.code === "LIMIT_FILE_SIZE") {
      response.status(413).json({ code: "FileTooLarge", message: "El archivo supera el tamaño máximo permitido." });
      return;
    }
    response.status(400).json({ code: "InvalidUpload", message: "No pudimos procesar el archivo enviado." });
    return;
  }
  if (typeof error === "object" && error !== null && "type" in error && (error as { type: string }).type === "entity.parse.failed") {
    response.status(400).json({ code: "InvalidRequest", message: "La solicitud no tiene un formato válido." });
    return;
  }
  console.error(error);
  response.status(500).json({ code: "ServerError", message: "Ocurrió un error inesperado en el servidor." });
}
