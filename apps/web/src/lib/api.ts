import type { EncryptedNote, EncryptedVault, NotePayload } from "@save-text/shared";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3000";

export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem("save-text-token");
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });
  const body = await response.json();
  if (!response.ok) throw new ApiError(body.error ?? "Request failed", response.status);
  return body as T;
}

export const api = {
  async authenticate(mode: "login" | "register", email: string, password: string) {
    const result = await request<{ token: string; user: { id: string; email: string } }>(`/auth/${mode}`, {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    localStorage.setItem("save-text-token", result.token);
    localStorage.setItem("save-text-email", result.user.email);
    return result;
  },
  logout: () => request<{ ok: true }>("/auth/logout", { method: "POST" }),
  deleteAccount: (password: string) => request<{ ok: true }>("/auth/delete-account", {
    method: "POST",
    body: JSON.stringify({ password }),
  }),
  getVault: () => request<{ vault: EncryptedVault | null }>("/vault"),
  createVault: (vault: EncryptedVault) => request<{ ok: true }>("/vault", {
    method: "POST",
    body: JSON.stringify(vault),
  }),
  getNotes: () => request<{ notes: EncryptedNote[] }>("/notes"),
  saveNote: (note: NotePayload) => request<{ version: number; updatedAt: string }>(`/notes/${note.id}`, {
    method: "PUT",
    body: JSON.stringify(note),
  }),
  deleteNote: (id: string) => request<{ ok: true }>(`/notes/${id}`, {
    method: "DELETE",
  }),
};
