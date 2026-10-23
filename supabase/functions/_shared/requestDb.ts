// A database pool per request (IR3-R6). No imports, so the Edge Function
// (Deno) and Node tests run the same code.
//
// cleanup-drafts never cancels a query (IR3-R4): a query that outlives its
// wait keeps holding the pool's single connection. Opening the pool per
// request and closing it at once when the request ends (`end({ timeout: 0 })`
// closes the connection even with queries outstanding) means such a query
// can never queue a later request's calls.

/** The part of a postgres.js `Sql` this needs. */
export type EndableDb = { end: (options: { timeout: number }) => Promise<unknown> };

/** Runs `use` with a fresh pool from `open`, closed without waiting when it ends. */
export function createRequestDb<S extends EndableDb>(open: () => S) {
  return async function withDb<T>(use: (db: S) => Promise<T>): Promise<T> {
    const db = open();
    try {
      return await use(db);
    } finally {
      // Not awaited: the response does not wait for a hung query to end.
      void db.end({ timeout: 0 }).catch(() => {});
    }
  };
}
