// Local-only fake supabase shared by the Node harness and the handler tests.
export function createFakeSupabase() {
  const tables = {
    waitlist: [],
    events: [],
    partners: [],
    contacts: [],
    emergency_sessions: [],
    sos_alerts: [],
    location_updates: [],
    user_preferences: [],
  };

  function builder(table) {
    if (!tables[table]) tables[table] = [];

    const state = {
      table,
      head: false,
      single: false,
      eqs: [],
      orderField: null,
      ascending: true,
      limit: null,
      columns: "*",
      updateValues: null,
      isDelete: false,
    };

    const b = {
      insert(rec) {
        if (table === "waitlist" && tables.waitlist.some((r) => r.email === rec.email)) {
          return Promise.resolve({ data: null, error: { code: "23505" } });
        }
        const toInsert = Array.isArray(rec) ? rec : [rec];
        for (const item of toInsert) {
          tables[table].push({ ...item });
        }
        return Promise.resolve({ data: Array.isArray(rec) ? toInsert : toInsert[0], error: null });
      },

      update(values) {
        state.updateValues = values;
        return b;
      },

      delete() {
        state.isDelete = true;
        return b;
      },

      select(columns = "*", opts) {
        state.columns = columns;
        state.head = !!opts?.head;
        return b;
      },

      eq(col, val) {
        state.eqs.push([col, val]);
        return b;
      },

      order(col, { ascending = true } = {}) {
        state.orderField = col;
        state.ascending = ascending;
        return b;
      },

      limit(n) {
        state.limit = n;
        return b;
      },

      single() {
        state.single = true;
        return b;
      },

      then(resolve, reject) {
        let rows = tables[state.table];

        // Handle update
        if (state.updateValues) {
          const updated = [];
          for (let i = 0; i < tables[state.table].length; i++) {
            const r = tables[state.table][i];
            let match = true;
            for (const [col, val] of state.eqs) {
              if (r[col] !== val) { match = false; break; }
            }
            if (match) {
              tables[state.table][i] = { ...r, ...state.updateValues };
              updated.push(tables[state.table][i]);
            }
          }
          return Promise.resolve({ data: updated, error: null }).then(resolve, reject);
        }

        // Handle delete
        if (state.isDelete) {
          const remaining = [];
          const deleted = [];
          for (const r of tables[state.table]) {
            let match = true;
            for (const [col, val] of state.eqs) {
              if (r[col] !== val) { match = false; break; }
            }
            if (match) deleted.push(r);
            else remaining.push(r);
          }
          tables[state.table] = remaining;
          return Promise.resolve({ data: deleted, error: null }).then(resolve, reject);
        }

        // Handle query filter
        let filtered = rows;
        for (const [col, val] of state.eqs) {
          filtered = filtered.filter((r) => r[col] === val);
        }

        if (state.orderField) {
          const f = state.orderField;
          const asc = state.ascending;
          filtered.sort((a, b) => {
            if (a[f] < b[f]) return asc ? -1 : 1;
            if (a[f] > b[f]) return asc ? 1 : -1;
            return 0;
          });
        }

        if (state.limit) {
          filtered = filtered.slice(0, state.limit);
        }

        if (state.head) {
          return Promise.resolve({ data: null, count: filtered.length, error: null }).then(resolve, reject);
        }

        const project = (r) => {
          if (!r) return null;
          if (state.columns === "*") return { ...r };
          return Object.fromEntries(
            state.columns.split(",").map((c) => [c.trim(), r[c.trim()]])
          );
        };

        if (state.single) {
          const item = filtered.length > 0 ? project(filtered[0]) : null;
          return Promise.resolve({
            data: item,
            error: item ? null : { code: "PGRST116", message: "Row not found" },
          }).then(resolve, reject);
        }

        return Promise.resolve({
          data: filtered.map(project),
          error: null,
        }).then(resolve, reject);
      },
    };

    return b;
  }

  return { from: builder, tables };
}
