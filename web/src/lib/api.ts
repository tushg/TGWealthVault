const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });

  if (!res.ok) {
    let message = "request failed";
    try {
      const body = await res.json();
      message = body.error || message;
    } catch {
      /* ignore */
    }
    throw new ApiError(res.status, message);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export type User = {
  id: string;
  email: string;
  name: string;
  role: string;
  mfa_enabled: boolean;
};

export type DashboardSummary = {
  total_deposits: string;
  total_mf_value: string;
  total_goals_target: string;
  total_goals_saved: string;
  month_income: string;
  month_expense: string;
  upcoming_maturities: number;
  active_policies: number;
};

export type Deposit = {
  id: string;
  type: string;
  bank_name: string;
  principal: string;
  interest_rate: string;
  start_date: string;
  maturity_date: string;
  maturity_amount?: string;
  status: string;
};

export type Goal = {
  id: string;
  name: string;
  target_amount: string;
  current_amount: string;
  target_date?: string;
  category?: string;
};

export const api = {
  health: () => request<{ status: string }>("/health"),
  login: (email: string, password: string) =>
    request<{ user: User; mfa_pending: boolean }>("/api/v1/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  verifyMfa: (code: string) =>
    request<{ status: string }>("/api/v1/auth/mfa/verify", {
      method: "POST",
      body: JSON.stringify({ code }),
    }),
  logout: () => request<{ status: string }>("/api/v1/auth/logout", { method: "POST" }),
  me: () => request<{ user: User; mfa_verified: boolean }>("/api/v1/auth/me"),
  dashboard: () => request<DashboardSummary>("/api/v1/dashboard"),
  deposits: () => request<Deposit[]>("/api/v1/deposits"),
  goals: () => request<Goal[]>("/api/v1/goals"),
  createDeposit: (body: Record<string, unknown>) =>
    request<Deposit>("/api/v1/deposits", { method: "POST", body: JSON.stringify(body) }),
  createGoal: (body: Record<string, unknown>) =>
    request<Goal>("/api/v1/goals", { method: "POST", body: JSON.stringify(body) }),
  createPerson: (name: string, relation?: string) =>
    request("/api/v1/persons", {
      method: "POST",
      body: JSON.stringify({ name, relation }),
    }),
};
