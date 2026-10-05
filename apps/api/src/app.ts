import { cors } from "@elysiajs/cors";
import { Elysia } from "elysia";
import { config } from "./config";
import { accountRoutes } from "./routes/account";
import { createAuthRoutes } from "./routes/auth";
import { healthRoutes } from "./routes/health";
import { noteRoutes } from "./routes/notes";
import { vaultRoutes } from "./routes/vault";

import { RequestProtectionError, Security } from "./services/security";

export function createApp(security = new Security()) {
  return new Elysia({ name: "deeznote.api", serve: { maxRequestBodySize: security.options.maxBodyBytes } })
  .headers({
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
  })
  .onRequest(({ request, server }) => {
    security.protect(request, server?.requestIP(request)?.address);
  })
  .onParse(({ request }, contentType) => security.parseJson(request, contentType))
  .use(cors({ origin: config.webOrigin }))
  .onError(({ code, error, set }) => {
    // Elysia wraps errors thrown by onParse in ParseError.
    const protectionError = error instanceof RequestProtectionError ? error
      : "cause" in error && error.cause instanceof RequestProtectionError ? error.cause : null;
    if (protectionError) {
      set.status = protectionError.status;
      if (protectionError.retryAfter !== undefined) set.headers["Retry-After"] = String(protectionError.retryAfter);
      return { error: protectionError.message };
    }
    if (code === "NOT_FOUND") {
      set.status = 404;
      return { error: "Not found" };
    }
    if (code === "VALIDATION" || code === "PARSE") {
      set.status = 400;
      return { error: "Invalid request" };
    }
    console.error(code, error);
    set.status = 500;
    return { error: "Something went wrong" };
  })
  .use(healthRoutes)
  .use(createAuthRoutes(security))
  .use(accountRoutes)
  .use(vaultRoutes)
  .use(noteRoutes);
}

export const app = createApp();
