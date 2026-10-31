// Local-only fake supabase shared by the Node harness and the handler tests.
export function createFakeSupabase() {
  const tables = { waitlist: [], events: [], partners: [] };

  function builder(table) {
    const state = { table, head: false, eqs: [], limit: null, columns: "*" };
    const b = {
      insert(rec) {
        if (table === "waitlist" && tables.waitlist.some((r) => r.email === rec.email)) {
          return Promise.resolve({ data: null, error: { code: "23505" } });
        }
        tables[table].push(rec);
        return Promise.resolve({ data: null, error: null });
      },
      select(columns, opts) {
        state.columns = columns;
        state.head = !!opts?.head;
        return b;
      },
      eq(col, val) {
        state.eqs.push([col, val]);
        return b;
      },
      limit(n) {
        state.limit = n;
        return b;
      },
      then(resolve, reject) {
        let rows = tables[state.table];
        for (const [col, val] of state.eqs) rows = rows.filter((r) => r[col] === val);
        if (state.limit) rows = rows.slice(0, state.limit);
        const result = state.head
          ? { data: null, count: rows.length, error: null }
          : {
              data: rows.map((r) =>
                state.columns === "*"
                  ? r
                  : Object.fromEntries(state.columns.split(",").map((c) => [c.trim(), r[c.trim()]])),
              ),
              error: null,
            };
        return Promise.resolve(result).then(resolve, reject);
      },
    };
    return b;
  }

  return { from: builder, tables };
}
