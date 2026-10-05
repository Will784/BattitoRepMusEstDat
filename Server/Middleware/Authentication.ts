import type { NextFunction, Request, Response } from "express";
import type { UserData } from "../../Shared/Types";
import type { AuthenticationService } from "../Services/AuthenticationService";
import { HttpError } from "../HttpError";

declare global {
  namespace Express {
    interface Request {
      user?: UserData;
    }
  }
}

export const SessionCookieName = "battitoSession";

export function attachUser(authentication: AuthenticationService) {
  return (request: Request, _response: Response, next: NextFunction): void => {
    const token = (request.cookies as Record<string, string | undefined> | undefined)?.[SessionCookieName];
    if (token !== undefined && token.length > 0) {
      const user = authentication.verifyToken(token);
      if (user !== null) {
        request.user = user;
      }
    }
    next();
  };
}

export function requireUser(request: Request, _response: Response, next: NextFunction): void {
  if (request.user === undefined) {
    next(new HttpError(401, "AuthenticationRequired", "Inicia sesión para continuar."));
    return;
  }
  next();
}

export function currentUser(request: Request): UserData {
  if (request.user === undefined) {
    throw new HttpError(401, "AuthenticationRequired", "Inicia sesión para continuar.");
  }
  return request.user;
}
