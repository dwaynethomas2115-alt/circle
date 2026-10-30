/** Deterministic transaction model for local tests; NOT proof of Appwrite hosted semantics. */
import type { Database } from "../function/repository";
import type { Value } from "../function/records";
export class FakeDatabase {
  rows = new Map<string, Value>();
  revisions = new Map<string, number>();
  transactions = new Map<
    string,
    { writes: Map<string, Value | null>; versions: Map<string, number> }
  >();
  calls: { method: string; args: Value }[] = [];
  count = 0;
  conflictNext = false;
  api = this as unknown as Database;
  key(a: Value) {
    return `${a.tableId}/${a.rowId}`;
  }
  view(tx?: string) {
    const rows = new Map(this.rows);
    if (tx)
      for (const [key, value] of this.transactions.get(tx)!.writes) {
        if (value) rows.set(key, value);
        else rows.delete(key);
      }
    return rows;
  }
  log(method: string, args: Value) {
    this.calls.push({ method, args: structuredClone(args) });
  }
  async getRow(a: Value) {
    this.log("getRow", a);
    const row = this.view(a.transactionId).get(this.key(a));
    if (!row) throw Object.assign(new Error("not found"), { code: 404 });
    return structuredClone(row);
  }
  async listRows(a: Value) {
    this.log("listRows", a);
    let rows = [...this.view(a.transactionId)]
      .filter(([key]) => key.startsWith(`${a.tableId}/`))
      .map(([, r]) => r);
    const queries = (a.queries || []).map((q: string) => JSON.parse(q));
    for (const q of queries)
      if (q.method === "equal")
        rows = rows.filter((r) => q.values.includes(r[q.attribute]));
    for (const q of queries)
      if (q.method === "greaterThan")
        rows = rows.filter((r) => r[q.attribute] > q.values[0]);
    for (const q of queries)
      if (q.method === "orderAsc" || q.method === "orderDesc")
        rows.sort(
          (a, b) =>
            String(a[q.attribute]).localeCompare(String(b[q.attribute])) *
            (q.method === "orderDesc" ? -1 : 1),
        );
    const cursor = queries.find((q: Value) => q.method === "cursorAfter");
    if (cursor)
      rows = rows.slice(rows.findIndex((r) => r.$id === cursor.values[0]) + 1);
    rows = rows.slice(
      0,
      queries.find((q: Value) => q.method === "limit")?.values[0] ?? 25,
    );
    return { rows: structuredClone(rows), total: rows.length };
  }
  async createTransaction(a: Value) {
    this.log("begin", a);
    const id = `tx-${++this.count}`;
    this.transactions.set(id, { writes: new Map(), versions: new Map() });
    return { $id: id, status: "pending" };
  }
  write(a: Value, value: Value | null) {
    const key = this.key(a);
    if (!a.transactionId) throw new Error("Test requires transactional writes");
    const tx = this.transactions.get(a.transactionId)!;
    if (!tx.versions.has(key))
      tx.versions.set(key, this.revisions.get(key) || 0);
    tx.writes.set(key, value);
  }
  async createRow(a: Value) {
    this.log("createRow", a);
    if (this.view(a.transactionId).has(this.key(a)))
      throw Object.assign(new Error("exists"), { code: 409 });
    const row = { $id: a.rowId, $permissions: a.permissions || [], ...a.data };
    this.write(a, row);
    return row;
  }
  async updateRow(a: Value) {
    this.log("updateRow", a);
    const old = this.view(a.transactionId).get(this.key(a));
    if (!old) throw Object.assign(new Error("missing"), { code: 404 });
    const row = {
      ...old,
      ...a.data,
      ...(a.permissions ? { $permissions: a.permissions } : {}),
    };
    this.write(a, row);
    return row;
  }
  async deleteRow(a: Value) {
    this.log("deleteRow", a);
    this.write(a, null);
    return {};
  }
  async updateTransaction(a: Value) {
    this.log(a.commit ? "commit" : "rollback", a);
    const tx = this.transactions.get(a.transactionId)!;
    if (a.commit) {
      if (this.conflictNext) {
        this.conflictNext = false;
        throw Object.assign(new Error("conflict"), { code: 409 });
      }
      for (const [key, version] of tx.versions)
        if ((this.revisions.get(key) || 0) !== version)
          throw Object.assign(new Error("conflict"), { code: 409 });
      for (const [key, value] of tx.writes) {
        if (value) this.rows.set(key, structuredClone(value));
        else this.rows.delete(key);
        this.revisions.set(key, (this.revisions.get(key) || 0) + 1);
      }
    }
    this.transactions.delete(a.transactionId);
    return { status: a.commit ? "committed" : "rolled_back" };
  }
  seed(table: string, id: string, data: Value) {
    this.rows.set(`${table}/${id}`, { $id: id, $permissions: [], ...data });
    this.revisions.set(`${table}/${id}`, 1);
  }
}
