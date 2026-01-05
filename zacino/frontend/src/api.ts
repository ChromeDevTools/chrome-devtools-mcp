import { getToken } from "./auth";

const baseUrl = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

export type Job = {
  id: string;
  name: string;
  description: string | null;
  status: "queued" | "running" | "completed" | "failed";
  score: number;
};

export type AuthResponse = {
  access_token: string;
  token_type: string;
};

async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers ?? {})
    }
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({ detail: "Request failed" }));
    throw new Error(errorBody.detail ?? "Request failed");
  }

  if (response.status === 204) {
    return null as T;
  }
  return (await response.json()) as T;
}

export const api = {
  register: (email: string, password: string) =>
    apiFetch<AuthResponse>("/api/v1/auth/register", {
      method: "POST",
      body: JSON.stringify({ email, password })
    }),
  login: (email: string, password: string) =>
    apiFetch<AuthResponse>("/api/v1/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password })
    }),
  listJobs: () => apiFetch<Job[]>("/api/v1/jobs"),
  createJob: (payload: { name: string; description?: string }) =>
    apiFetch<Job>("/api/v1/jobs", {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  updateJob: (jobId: string, payload: Partial<Job>) =>
    apiFetch<Job>(`/api/v1/jobs/${jobId}`, {
      method: "PATCH",
      body: JSON.stringify(payload)
    }),
  deleteJob: (jobId: string) =>
    apiFetch<void>(`/api/v1/jobs/${jobId}`, {
      method: "DELETE"
    })
};
