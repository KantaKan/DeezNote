import { cors } from "@elysiajs/cors";
import { Elysia } from "elysia";
import { config } from "./config";
import { authRoutes } from "./routes/auth";
import { healthRoutes } from "./routes/health";
import { noteRoutes } from "./routes/notes";
import { vaultRoutes } from "./routes/vault";

export const app = new Elysia({ name: "deeznote.api" })
  .use(cors({ origin: config.webOrigin }))
  .onError(({ code, error, set }) => {
    if (code === "VALIDATION") {
      set.status = 400;
      return { error: "Invalid request" };
    }
    console.error(code, error);
    set.status = 500;
    return { error: "Something went wrong" };
  })
  .use(healthRoutes)
  .use(authRoutes)
  .use(vaultRoutes)
  .use(noteRoutes);
