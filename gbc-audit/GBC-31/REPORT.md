# GBC-31: Journal Entry — invisible-data bug + client-side filter

**Severity:** Low · **Category:** Screen Review — Financial Suite · **Status:** needs-input

## Root cause
`useJournalEntries()` in `src/hooks/useLedger.ts` fetches with `.limit(200)`. Search bar in `JournalEntry.tsx` filters the downloaded array client-side. ⇒ Anything past row 200 is invisible to search, and totals computed in JS over the array are short.

## Council verdict (compressed)
Two changes: (a) remove the hardcoded limit and paginate properly via cursor or page+pageSize; (b) move search and aggregation server-side via a `search_journal_entries(q, from, to, page, page_size)` SQL function that returns matching rows + total count.

## Status
needs-input — replace `.limit(200)` with cursor pagination; add SQL search function (pairs with GBC-14).

## Risks
1. Existing UI assumes a single array; pagination may need infinite-scroll or page controls.
2. Lint/build/test could not run in this sandbox.
