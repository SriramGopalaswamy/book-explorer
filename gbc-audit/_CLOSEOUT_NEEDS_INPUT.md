# needs-input close-out — 2026-05-11

All three remaining `needs-input` items are closed. Final disposition:

| Key | Disposition | Why |
|---|---|---|
| **GBC-5** | closed (wontfix — by design) | React Query is the de-facto global store. Adding Zustand/Redux would duplicate it. Specific cross-module staleness bugs, if any surface, get filed as their own concrete Jira tickets with reproduction steps. |
| **GBC-30** | closed (not-a-bug) | Jira ticket filed with empty description; user-confirmed no actual breakage. Pagination/aggregation concerns already covered by GBC-31, GBC-32, GBC-53. |
| **GBC-49** | closed (parked → separate workstream) | NIC e-invoice integration is a compliance workstream needing GSP credentials + legal review + procurement sign-off. Not engineering's audit scope. Tracked separately. |

## Revised tally

| Status | count |
|---|---:|
| **resolved**     | 32 |
| **closed (wontfix/not-a-bug/parked)** | 3 |
| **partial**      | 20 |
| **needs-input**  | 0 |

35/65 closed (54%). The remaining 20 `partial` items are all blocked on Lovable applying the 6 SQL migrations from PR #239 + running the smoke tests in `_LOVABLE_VERIFICATION_PROMPT.md`, or on follow-up work explicitly out of this audit's scope.
