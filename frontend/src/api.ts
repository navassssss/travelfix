import { storage } from "./storage";

const API_URL = (import.meta.env.VITE_API_URL as string | undefined) || "";
export const TOKEN_KEY = "tf_token";
export const GUEST_KEY = "tf_guest_token";
export const PROFILE_KEY = "tf_profile_id";

export interface Profile {
  id: number;
  name: string;
  email: string;
  role: "user" | "admin";
  home_base: string;
  notify_cases: boolean;
  notify_contributions: boolean;
  public_profile: boolean;
}

export interface CaseItem {
  id: number;
  problem: string;
  category: string;
  location: string;
  destination: string;
  urgency: string;
  status: string;
  summary: string;
  immediate_actions: string[];
  steps: string[];
  alternatives: string[];
  sources: { kind: string; label: string; solutionId?: number; resourceId?: number }[];
  clarification_question: string | null;
  feedback_rating: number | null;
  feedback_helpful: boolean | null;
  feedback_comment: string | null;
  created_at: string;
  resolved_at: string | null;
}

export interface Solution {
  id: number;
  destination: string;
  title: string;
  problem: string;
  solution: string;
  steps: string[];
  tips: string;
  sources: string[];
  status: string;
  contributor_name: string;
  created_at: string;
  published_at: string | null;
}

export interface Contribution extends Solution {
  profile_id: number;
  admin_comment: string | null;
}

export interface Resource {
  id: number;
  name: string;
  category: string;
  destination: string;
  description: string;
  url: string | null;
  contact_info: string | null;
  verified: boolean;
  status: string;
  last_verified: string | null;
}

export function getToken(): string | null {
  return storage.get(TOKEN_KEY);
}

export function getGuestToken(): string | null {
  return storage.get(GUEST_KEY);
}

async function call<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const token = getToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const guest = getGuestToken();
  if (guest) headers["x-guest-token"] = guest;
  const res = await fetch(`${API_URL}${path}`, { ...options, headers: { ...headers, ...(options.headers as Record<string, string>) } });
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { error: text };
  }
  if (!res.ok) {
    const msg = (data as { error?: string })?.error || `Request failed (${res.status})`;
    throw new Error(msg);
  }
  return data as T;
}

export const api = {
  get: <T>(path: string) => call<T>(path),
  post: <T>(path: string, body?: unknown) => call<T>(path, { method: "POST", body: JSON.stringify(body ?? {}) }),
  patch: <T>(path: string, body?: unknown) => call<T>(path, { method: "PATCH", body: JSON.stringify(body ?? {}) }),
  del: <T>(path: string) => call<T>(path, { method: "DELETE" }),

  signup: (name: string, email: string) => call<{ profile: Profile; token: string }>("/api/auth/signup", { method: "POST", body: JSON.stringify({ name, email }) }),
  signin: (email: string) => call<{ profile: Profile; token: string }>("/api/auth/signin", { method: "POST", body: JSON.stringify({ email }) }),

  submitCase: (body: { problem: string; category: string; location: string; destination: string }) =>
    call<{ case: CaseItem; guest_token: string | null }>("/api/cases", { method: "POST", body: JSON.stringify(body) }),
  getCase: (id: number) => call<{ case: CaseItem; messages: { id: number; role: string; content: string; created_at: string }[] }>(`/api/cases/${id}`),
  myCases: () => call<{ cases: CaseItem[] }>("/api/cases"),
  guestCases: (token: string) => call<{ cases: CaseItem[] }>(`/api/cases/guest/${token}`),
  followup: (id: number, message: string) => call<{ reply: string; messages: { id: number; role: string; content: string; created_at: string }[] }>(`/api/cases/${id}/followups`, { method: "POST", body: JSON.stringify({ message }) }),
  setCaseStatus: (id: number, status: string) => call<{ case: CaseItem }>(`/api/cases/${id}/status`, { method: "POST", body: JSON.stringify({ status }) }),
  feedback: (id: number, body: { rating?: number; helpful?: boolean; comment?: string }) =>
    call<{ case: CaseItem }>(`/api/cases/${id}/feedback`, { method: "POST", body: JSON.stringify(body) }),

  solutions: (search = "", category = "") => {
    const q = new URLSearchParams();
    if (search) q.set("search", search);
    if (category) q.set("category", category);
    const s = q.toString();
    return call<{ solutions: Solution[] }>(`/api/solutions${s ? `?${s}` : ""}`);
  },
  solution: (id: number) => call<{ solution: Solution }>(`/api/solutions/${id}`),
  saved: () => call<{ solutions: Solution[] }>("/api/saved"),
  saveSolution: (id: number) => call(`/api/solutions/${id}/save`, { method: "POST" }),
  unsaveSolution: (id: number) => call(`/api/solutions/${id}/save`, { method: "DELETE" }),

  myContributions: () => call<{ contributions: Contribution[] }>("/api/contributions/mine"),
  createContribution: (body: Record<string, unknown>) => call<{ contribution: Contribution }>("/api/contributions", { method: "POST", body: JSON.stringify(body) }),
  updateContribution: (id: number, body: Record<string, unknown>) => call<{ contribution: Contribution }>(`/api/contributions/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  deleteContribution: (id: number) => call(`/api/contributions/${id}`, { method: "DELETE" }),

  report: (body: { target_type: string; target_id: number; reason: string; reporter_email?: string }) =>
    call("/api/reports", { method: "POST", body: JSON.stringify(body) }),

  adminOverview: () => call<{ totals: Record<string, number>; recentCases: CaseItem[]; recentContributions: Contribution[] }>("/api/admin/overview"),
  adminContributions: (status = "") => call<{ contributions: Contribution[] }>(`/api/admin/contributions${status ? `?status=${status}` : ""}`),
  reviewContribution: (id: number, action: string, comment?: string) =>
    call(`/api/admin/contributions/${id}/review`, { method: "POST", body: JSON.stringify({ action, comment }) }),
  adminResources: () => call<{ resources: Resource[] }>("/api/admin/resources"),
  saveResource: (body: Record<string, unknown>) => call<{ resource: Resource }>("/api/admin/resources", { method: "POST", body: JSON.stringify(body) }),
  updateResource: (id: number, body: Record<string, unknown>) => call<{ resource: Resource }>(`/api/admin/resources/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  verifyResource: (id: number, action: string) => call(`/api/admin/resources/${id}/verify`, { method: "POST", body: JSON.stringify({ action }) }),
  adminReports: () => call<{ reports: { id: number; target_type: string; target_id: number; reason: string; reporter_email: string | null; status: string; created_at: string }[] }>("/api/admin/reports"),
  setReportStatus: (id: number, status: string, archive = false) =>
    call(`/api/admin/reports/${id}/status`, { method: "POST", body: JSON.stringify({ status, archive }) }),
};

export function signOut() {
  storage.remove(TOKEN_KEY);
  storage.remove(PROFILE_KEY);
}
