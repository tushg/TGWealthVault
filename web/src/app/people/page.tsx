"use client";

import { FormEvent, useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { api, Person } from "@/lib/api";
import { useSession } from "@/lib/useSession";

export default function PeoplePage() {
  const { user, loading } = useSession();
  const [people, setPeople] = useState<Person[]>([]);

  async function load() {
    setPeople((await api.persons()) || []);
  }
  useEffect(() => {
    if (user) load().catch(() => undefined);
  }, [user]);

  async function onCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    await api.createPerson(String(fd.get("name")), String(fd.get("relation") || "") || undefined);
    e.currentTarget.reset();
    await load();
  }

  if (loading || !user) return <div className="min-h-screen grid place-items-center text-[var(--muted)]">Loading…</div>;

  return (
    <AppShell userName={user.name} title="Family members" subtitle="Tag deposits, folios, and goals to people in the household.">
      <form onSubmit={onCreate} className="panel p-5 mb-6 flex flex-wrap gap-3">
        <input name="name" required placeholder="Name" className="field max-w-xs" />
        <input name="relation" placeholder="Self / Spouse / Child" className="field max-w-xs" />
        <button className="btn-primary">Add member</button>
      </form>
      <div className="panel overflow-hidden">
        <table className="table-pro">
          <thead><tr><th>Name</th><th>Relation</th></tr></thead>
          <tbody>
            {people.length === 0 ? <tr><td colSpan={2} className="text-[var(--muted)]">No members yet.</td></tr> : people.map((p) => (
              <tr key={p.id}><td className="font-medium">{p.name}</td><td>{p.relation || "—"}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </AppShell>
  );
}
