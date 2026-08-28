const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:3000";
const TOKEN_KEY = "admin_token";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string> | undefined),
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });

  if (res.status === 401) {
    clearToken();
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(res.status, (data as { error?: string })?.error || `Request failed (${res.status})`);
  }
  return data as T;
}

export async function login(password: string): Promise<void> {
  const { token } = await request<{ token: string }>("/admin/login", {
    method: "POST",
    body: JSON.stringify({ password }),
  });
  setToken(token);
}

export interface PostLog {
  _id: string;
  status: string;
  topic?: string;
  article?: string;
  imageUrl?: string;
  reason?: string;
  error?: string;
  approveError?: string;
  postDateKey?: string;
  createdAt: string;
  updatedAt: string;
  finishedAt?: string;
}

export function listPosts(status?: string): Promise<{ posts: PostLog[] }> {
  const query = status ? `?status=${encodeURIComponent(status)}` : "";
  return request(`/admin/posts${query}`);
}

export function listPendingPosts(): Promise<{ posts: PostLog[] }> {
  return request("/admin/posts/pending");
}

export function approvePost(id: string): Promise<{ ok: boolean; error?: string }> {
  return request(`/admin/posts/${id}/approve`, { method: "POST" });
}

export function rejectPost(id: string): Promise<{ ok: boolean; error?: string }> {
  return request(`/admin/posts/${id}/reject`, { method: "POST" });
}

export interface ConversationSummary {
  userId: string;
  lastMessageText: string;
  lastMessageRole: string;
  lastMessageAt: string;
  messageCount: number;
}

export function listConversations(): Promise<{ conversations: ConversationSummary[] }> {
  return request("/admin/conversations");
}

export interface ConversationMessage {
  role: string;
  text: string;
  createdAt: string;
  isHumanAdmin?: boolean;
}

export interface ConversationDetail {
  userId: string;
  messages: ConversationMessage[];
  paused: boolean;
  pausedUntil: string | null;
}

export function getConversation(userId: string): Promise<ConversationDetail> {
  return request(`/admin/conversations/${encodeURIComponent(userId)}`);
}

export function pauseConversation(userId: string): Promise<{ ok: boolean }> {
  return request(`/admin/conversations/${encodeURIComponent(userId)}/pause`, { method: "POST" });
}

export function resumeConversation(userId: string): Promise<{ ok: boolean }> {
  return request(`/admin/conversations/${encodeURIComponent(userId)}/resume`, { method: "POST" });
}

export function getKnowledgeBase(): Promise<{ content: string }> {
  return request("/admin/knowledge");
}

export function updateKnowledgeBase(content: string): Promise<{ ok: boolean }> {
  return request("/admin/knowledge", { method: "PUT", body: JSON.stringify({ content }) });
}
