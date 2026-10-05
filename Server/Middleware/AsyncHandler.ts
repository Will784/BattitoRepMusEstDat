import type { NextFunction, Request, RequestHandler, Response } from "express";

export function asyncHandler(handler: (request: Request, response: Response, next: NextFunction) => Promise<void> | void): RequestHandler {
  return (request, response, next) => {
    Promise.resolve()
      .then(() => handler(request, response, next))
      .catch(next);
  };
}
