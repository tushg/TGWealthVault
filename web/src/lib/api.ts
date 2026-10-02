const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8081";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers || {});
  if (!(init.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    credentials: "include",
    headers,
  });
  if (!res.ok) {
    let message = "request failed";
    try {
      const body = await res.json();
      message = body.error || body.notes || message;
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

export type PortfolioOverview = {
  net_worth: string;
  total_deposits: string;
  total_mf_value: string;
  total_goals_target: string;
  total_goals_saved: string;
  goal_funding_pct: string;
  month_income: string;
  month_expense: string;
  month_surplus: string;
  upcoming_maturities: number;
  active_policies: number;
  mf_count: number;
  open_alerts: number;
  allocation: { name: string; value: string; weight: string }[];
  actions: { kind: string; title: string; detail: string; severity: string; href: string }[];
  top_holdings: MFHolding[];
  goals: Goal[];
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
  fd_number?: string;
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
  goal_type?: string;
  monthly_contribution?: string;
  priority?: number;
};

export type MFHolding = {
  id: string;
  amc?: string;
  scheme_name: string;
  scheme_code?: string;
  units: string;
  nav?: string;
  invested_amount?: string;
  current_value?: string;
  category?: string;
  source: string;
};

export type Policy = {
  id: string;
  insurer: string;
  policy_type: string;
  premium_amount?: string;
  premium_frequency?: string;
  sum_assured?: string;
  next_due_date?: string;
  status: string;
};

export type CashflowEntry = {
  id: string;
  type: string;
  category: string;
  amount: string;
  entry_month: string;
  recurring: boolean;
};

export type Person = {
  id: string;
  name: string;
  relation?: string;
};

export type VaultAlert = {
  id: string;
  kind: string;
  severity: string;
  title: string;
  detail: string;
  href?: string;
  status: string;
  created_at: string;
  confirmed_at?: string;
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
  portfolio: () => request<PortfolioOverview>("/api/v1/portfolio"),
  deposits: (status?: string) =>
    request<Deposit[]>(`/api/v1/deposits${status ? `?status=${encodeURIComponent(status)}` : ""}`),
  goals: () => request<Goal[]>("/api/v1/goals"),
  mf: () => request<MFHolding[]>("/api/v1/mf"),
  policies: () => request<Policy[]>("/api/v1/policies"),
  cashflow: () => request<CashflowEntry[]>("/api/v1/cashflow"),
  persons: () => request<Person[]>("/api/v1/persons"),
  statements: () => request<Record<string, unknown>[]>("/api/v1/mf/statements"),
  alerts: (status?: string) =>
    request<VaultAlert[]>(`/api/v1/alerts${status ? `?status=${encodeURIComponent(status)}` : ""}`),
  alertSummary: () => request<{ open: number }>("/api/v1/alerts/summary"),
  confirmAlert: (id: string) =>
    request<VaultAlert>(`/api/v1/alerts/${id}/confirm`, { method: "POST" }),
  createDeposit: (body: Record<string, unknown>) =>
    request<Deposit>("/api/v1/deposits", { method: "POST", body: JSON.stringify(body) }),
  deleteDeposit: (id: string) =>
    request<{ status: string }>(`/api/v1/deposits/${id}`, { method: "DELETE" }),
  matureDeposit: (id: string) =>
    request<Deposit>(`/api/v1/deposits/${id}/mature`, { method: "POST" }),
  createGoal: (body: Record<string, unknown>) =>
    request<Goal>("/api/v1/goals", { method: "POST", body: JSON.stringify(body) }),
  createMF: (body: Record<string, unknown>) =>
    request<MFHolding>("/api/v1/mf", { method: "POST", body: JSON.stringify(body) }),
  createPolicy: (body: Record<string, unknown>) =>
    request<Policy>("/api/v1/policies", { method: "POST", body: JSON.stringify(body) }),
  createCashflow: (body: Record<string, unknown>) =>
    request<CashflowEntry>("/api/v1/cashflow", { method: "POST", body: JSON.stringify(body) }),
  createPerson: (name: string, relation?: string) =>
    request("/api/v1/persons", {
      method: "POST",
      body: JSON.stringify({ name, relation }),
    }),
  importMF: (form: FormData) =>
    request<{
      statement_id: string;
      source: string;
      holdings_imported: number;
      status: string;
      notes?: string;
      holdings?: MFHolding[];
    }>("/api/v1/mf/import", { method: "POST", body: form }),
};
