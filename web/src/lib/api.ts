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
    cache: "no-store",
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
  budget_id?: string;
};

export type ExpenseBudget = {
  id: string;
  name: string;
  allocated_amount: string;
  notes?: string;
  active: boolean;
  sort_order: number;
};

export type ExpenseDeviation = {
  budget_id: string;
  name: string;
  budget_amount: string;
  actual_amount: string;
  deviation: string;
  deviation_pct: string;
  abs_deviation: string;
};

export type ExpenseGrowth = {
  budget_id: string;
  name: string;
  first_amount: string;
  last_amount: string;
  absolute_growth: string;
  growth_pct: string;
  direction: "up" | "down" | "flat" | string;
};

export type ExpenseTrend = {
  buckets: string[];
  totals: string[];
  series: { name: string; points: string[] }[];
};

export type ExpenseReport = {
  period: string;
  label: string;
  from: string;
  to: string;
  year: number;
  month?: number;
  months_covered: number;
  total_budget: string;
  total_actual: string;
  total_deviation: string;
  items: ExpenseDeviation[];
  top_deviations: ExpenseDeviation[];
  trend: ExpenseTrend;
  growth: ExpenseGrowth[];
  top_growing: ExpenseGrowth[];
  history: string[];
};

export type MFTransaction = {
  id: string;
  holding_id: string;
  scheme_name: string;
  txn_date: string;
  description?: string;
  txn_type: string;
  amount?: string;
  units?: string;
  nav?: string;
  balance_units?: string;
};

export type GoalAsset = {
  goal_id: string;
  goal_name: string;
  asset_type: string;
  asset_id: string;
  asset_name: string;
  allocated_amount?: string;
  asset_value?: string;
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
  cashflow: (params?: { type?: string; from?: string; to?: string; month?: string }) => {
    const q = new URLSearchParams();
    if (params?.type) q.set("type", params.type);
    if (params?.from) q.set("from", params.from);
    if (params?.to) q.set("to", params.to);
    if (params?.month) q.set("month", params.month);
    const qs = q.toString();
    return request<CashflowEntry[]>(`/api/v1/cashflow${qs ? `?${qs}` : ""}`);
  },
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
  updateGoal: (id: string, body: Record<string, unknown>) =>
    request<Goal>(`/api/v1/goals/${id}`, { method: "PUT", body: JSON.stringify(body) }),
  deleteGoal: (id: string) =>
    request<{ status: string }>(`/api/v1/goals/${id}`, { method: "DELETE" }),
  goalAssets: (goalId?: string) =>
    request<GoalAsset[]>(goalId ? `/api/v1/goals/${goalId}/assets` : "/api/v1/goal-assets"),
  linkGoalAsset: (goalId: string, body: { asset_type: string; asset_id: string; allocated_amount?: string | null }) =>
    request<GoalAsset>(`/api/v1/goals/${goalId}/assets`, { method: "POST", body: JSON.stringify(body) }),
  unlinkGoalAsset: (goalId: string, assetType: string, assetId: string) =>
    request<{ status: string }>(`/api/v1/goals/${goalId}/assets/${assetType}/${assetId}`, { method: "DELETE" }),
  createMF: (body: Record<string, unknown>) =>
    request<MFHolding>("/api/v1/mf", { method: "POST", body: JSON.stringify(body) }),
  deleteMF: (id: string) =>
    request<{ status: string }>(`/api/v1/mf/${id}`, { method: "DELETE" }),
  mfTransactions: (holdingId?: string) =>
    request<MFTransaction[]>(
      `/api/v1/mf/transactions${holdingId ? `?holding_id=${encodeURIComponent(holdingId)}` : ""}`,
    ),
  createPolicy: (body: Record<string, unknown>) =>
    request<Policy>("/api/v1/policies", { method: "POST", body: JSON.stringify(body) }),
  deletePolicy: (id: string) =>
    request<{ status: string }>(`/api/v1/policies/${id}`, { method: "DELETE" }),
  createCashflow: (body: Record<string, unknown>) =>
    request<CashflowEntry>("/api/v1/cashflow", { method: "POST", body: JSON.stringify(body) }),
  deleteCashflow: (id: string) =>
    request<{ status: string }>(`/api/v1/cashflow/${id}`, { method: "DELETE" }),
  expenseBudgets: () => request<ExpenseBudget[]>("/api/v1/expense-budgets"),
  createExpenseBudget: (body: Record<string, unknown>) =>
    request<ExpenseBudget>("/api/v1/expense-budgets", { method: "POST", body: JSON.stringify(body) }),
  updateExpenseBudget: (id: string, body: Record<string, unknown>) =>
    request<ExpenseBudget>(`/api/v1/expense-budgets/${id}`, { method: "PUT", body: JSON.stringify(body) }),
  deleteExpenseBudget: (id: string) =>
    request<{ status: string }>(`/api/v1/expense-budgets/${id}`, { method: "DELETE" }),
  expenseReport: (params: {
    period: string;
    from?: string;
    to?: string;
    year?: number;
    month?: number;
  }) => {
    const q = new URLSearchParams({ period: params.period });
    if (params.from) q.set("from", params.from);
    if (params.to) q.set("to", params.to);
    if (params.year) q.set("year", String(params.year));
    if (params.month) q.set("month", String(params.month));
    return request<ExpenseReport>(`/api/v1/expense-report?${q}`);
  },
  seedExpenseDemoData: () =>
    request<{ status: string; stats: Record<string, number> }>("/api/v1/expense-report/demo-data", {
      method: "POST",
    }),
  createPerson: (name: string, relation?: string) =>
    request("/api/v1/persons", {
      method: "POST",
      body: JSON.stringify({ name, relation }),
    }),
  deletePerson: (id: string) =>
    request<{ status: string }>(`/api/v1/persons/${id}`, { method: "DELETE" }),
  deleteStatement: (id: string) =>
    request<{ status: string }>(`/api/v1/mf/statements/${id}`, { method: "DELETE" }),
  importMF: (form: FormData) =>
    request<{
      statement_id: string;
      source: string;
      holdings_imported: number;
      transactions_imported?: number;
      status: string;
      notes?: string;
      holdings?: MFHolding[];
    }>("/api/v1/mf/import", { method: "POST", body: form }),
};
