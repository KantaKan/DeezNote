import { describe, expect, test } from "bun:test";
import { app } from "./app";

function request(path: string, init?: RequestInit) {
  return app.handle(new Request(`http://localhost${path}`, init));
}

describe("DeezNote API", () => {
  test("reports its health", async () => {
    const response = await request("/health");

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
  });

  test("adds CORS headers for the configured web origin", async () => {
    const response = await request("/health", {
      headers: { Origin: "http://localhost:5173" },
    });

    expect(response.headers.get("access-control-allow-origin")).toBe("http://localhost:5173");
  });

  test("rejects vault access without a session", async () => {
    const response = await request("/vault");

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Unauthorized" });
  });

  test("rejects note access without a session", async () => {
    const response = await request("/notes");

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Unauthorized" });
  });

  test("validates registration before querying the database", async () => {
    const response = await request("/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "not-an-email", password: "short" }),
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Invalid request" });
  });
});
