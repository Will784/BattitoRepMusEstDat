import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import type { SessionData } from "../../Shared/Types";
import { asyncHandler } from "../Middleware/AsyncHandler";
import { SessionCookieName, requireUser } from "../Middleware/Authentication";
import type { AuthenticationService } from "../Services/AuthenticationService";

const credentialsSchema = z.object({
  email: z.string({ message: "Ingresa tu correo electrónico." }).trim().email("Ingresa un correo electrónico válido.").max(200),
  password: z.string({ message: "Ingresa tu contraseña." }).min(1, "Ingresa tu contraseña.").max(200),
  displayName: z.string().trim().max(60).optional()
});

export function createAuthenticationRoutes(authentication: AuthenticationService, secureCookies: boolean, rateLimitEnabled: boolean): Router {
  const router = Router();
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 30,
    standardHeaders: true,
    legacyHeaders: false,
    skip: () => !rateLimitEnabled,
    message: { code: "TooManyRequests", message: "Demasiados intentos. Espera unos minutos e inténtalo de nuevo." }
  });
  const cookieOptions = { httpOnly: true, sameSite: "lax" as const, secure: secureCookies, maxAge: 30 * 24 * 60 * 60 * 1000, path: "/" };

  router.post(
    "/register",
    limiter,
    asyncHandler(async (request, response) => {
      const body = credentialsSchema.parse(request.body);
      const user = await authentication.register(body.email, body.password, body.displayName);
      response.cookie(SessionCookieName, authentication.issueToken(user.id), cookieOptions);
      const session: SessionData = { user };
      response.status(201).json(session);
    })
  );

  router.post(
    "/login",
    limiter,
    asyncHandler(async (request, response) => {
      const body = credentialsSchema.parse(request.body);
      const user = await authentication.login(body.email, body.password);
      response.cookie(SessionCookieName, authentication.issueToken(user.id), cookieOptions);
      const session: SessionData = { user };
      response.json(session);
    })
  );

  router.post("/logout", (_request, response) => {
    response.clearCookie(SessionCookieName, { httpOnly: true, sameSite: "lax", secure: secureCookies, path: "/" });
    response.status(204).end();
  });

  router.get("/me", requireUser, (request, response) => {
    const session: SessionData = { user: request.user! };
    response.json(session);
  });

  return router;
}
