import { Elysia } from "elysia";

export const healthRoutes = new Elysia({ name: "routes.health" })
  .get("/health", () => ({ ok: true }));
