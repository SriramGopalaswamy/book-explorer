# Claude Code: GBC Codebase ToDo Resolver

**Project:** GRX10-Books-Codebase (Jira project `GBC`)
**Source of work:** `gbc_issues.json` — 65 ToDo issues (1 stub, 64 with detailed descriptions)
**Goal:** For every issue, do a deep root-cause analysis, run a 5-advisor LLM Council debate, then attempt a working code resolution — committing each one to its own branch with a structured report.

---

## Mission

You are running inside the GRX10-Books-Codebase repository as Claude Code. You have full filesystem access and the ability to read, edit, run, and test code. Your job is to systematically work through all 65 issues in `gbc_issues.json` and, for each one, produce a complete artifact bundle:

1. **Root-cause investigation** — confirmed against the actual codebase, not just the issue description
2. **LLM Council debate** — five distinct advisor personas weigh in, peer-review each other, then synthesize a verdict
3. **Resolution attempt** — actual code changes committed to a per-issue branch, with tests where applicable
4. **Per-issue report** — a markdown file documenting all of the above

You will not stop after one issue. You will work through the entire backlog autonomously, pausing only when the rules below say to.

---

## Inputs

Place these in the repo root before starting:

- `gbc_issues.json` — the issue export (already provided alongside this prompt)
- This file: `CLAUDE_CODE_PROMPT.md`

The JSON shape is:

```json
{
  "project": "GRX10-Books-Codebase",
  "project_key": "GBC",
  "total_issues": 65,
  "issues": [
    {
      "key": "GBC-1",
      "summary": "...",
      "description": "...",          // Full issue body (markdown-flavored)
      "category": "Cross-cutting — Frontend Architecture",
      "severity": "High|Medium|Low",  // Heuristic — re-validate yourself
      "tags": ["RLS", "Multi-tenant", "Performance", ...],
      "url": "https://grx10.atlassian.net/browse/GBC-1"
    },
    ...
  ]
}
```

---

## Outputs (per issue)

Create one folder per issue under `./gbc-audit/`:

```
gbc-audit/
  GBC-1/
    01_root_cause.md         # Investigation findings
    02_council.md            # Full council transcript + verdict
    03_resolution.md         # What was changed, why, test results
    REPORT.md                # Top-level rollup combining the above
    diff.patch               # The actual code diff (output of `git diff main...`)
  GBC-2/
    ...
  _INDEX.md                  # Master index of all issue reports with status
  _SUMMARY.md                # Cross-issue patterns and themes you noticed
```

Plus, at the repo level, one branch per resolved issue:
- Branch naming: `gbc/<issue-key>-<short-slug>` (e.g. `gbc/gbc-1-hooks-business-logic-to-rpcs`)
- Commit message format: `[GBC-N] <one-line summary>\n\n<3-5 line rationale>\n\nRefs: https://grx10.atlassian.net/browse/GBC-N`

---

## Phase-by-phase instructions

### PHASE 0 — Setup (run once, before any issue work)

1. Verify you are at the repo root and the working tree is clean. If not, stop and ask the user.
2. Confirm `gbc_issues.json` is present and parses. Print a one-line stats summary (total, severity counts, category counts).
3. Create the `gbc-audit/` folder and an empty `gbc-audit/_INDEX.md` with this skeleton:
   ```
   # GBC Codebase Audit — Master Index
   | Key | Severity | Category | Status | Branch | Report |
   |-----|----------|----------|--------|--------|--------|
   ```
4. Run a quick repo recon so you have grounding for every issue:
   - Identify the framework (likely React + Supabase based on issue tags)
   - Locate `src/hooks/`, `src/components/`, `supabase/migrations/`, `src/types/`
   - Note the auth/RLS pattern, the routing approach, and where the global state (if any) lives
   - Save findings to `gbc-audit/_REPO_RECON.md` — you'll reference this in every issue's investigation

### PHASE 1 — Triage and ordering

Don't process issues in numeric order. Sort by impact:

1. **First pass (security/integrity):** All `High` severity issues tagged with `Security`, `Multi-tenant`, or `Data Integrity`. These are blast-radius issues — fix them before anything else.
2. **Second pass (foundations):** Cross-cutting architecture issues (RLS, hooks pattern, monolithic files, TypeScript safety). Many screen-level issues will partially resolve once foundations are fixed.
3. **Third pass (per-screen):** Financial Suite → Inventory → Procurement → Sales → Manufacturing screens.
4. **Last:** Anything still labeled `Low` and the empty-description stub (`GBC-30`).

When fixing a foundation-level issue would partially fix a screen-level one, **note the dependency** in the screen issue's report and reduce its scope accordingly.

### PHASE 2 — Per-issue workflow (repeat for every issue)

For each issue, do exactly these steps, in order. Do not skip ahead.

#### 2A. Read and grep

- Read the issue's `summary` and `description` carefully.
- Grep the codebase for every concrete reference in the description (file names, function names, line numbers, table names, hook names). Confirm each one exists.
- If the description mentions a line number that no longer exists, find the equivalent code and note the drift in the report.

#### 2B. Root-cause investigation → `01_root_cause.md`

Open `01_root_cause.md` and answer all of these in writing:

1. **What the issue claims:** 2-3 sentences in your own words.
2. **What the code actually does:** Quote the relevant snippet(s) with file paths and current line numbers. Do not paraphrase code — show it.
3. **Is the claim accurate?** One of: `confirmed`, `partially confirmed`, `outdated`, `not reproduced`. If anything but `confirmed`, explain.
4. **What's the deeper root cause?** Look one layer below the symptom. (Example: "browser freezes on big lists" → root cause might be a hook that fetches without pagination AND a memo loop that runs O(n²)). Don't stop at the first plausible cause.
5. **Blast radius:** What other files/screens/users are affected? List them.
6. **Reversibility:** If the fix is wrong, how hard is it to roll back?
7. **Pre-existing tests:** Are there tests that would catch a regression? If not, note that you'll need to add some.

#### 2C. LLM Council debate → `02_council.md`

Run a 5-advisor council on the resolution. Each advisor argues independently, then they peer-review each other anonymously, then you synthesize.

The five advisors are fixed personas. Stay in character for each:

| Advisor | Stance | What they push for |
|---------|--------|--------------------|
| **The Contrarian** | "Maybe we shouldn't fix this at all." | Question whether the issue is real, whether the fix is worth the risk, whether the simplest interpretation of the description leads to over-engineering. |
| **The First-Principles Thinker** | "Why does this problem exist in the architecture?" | Trace the issue to a root design choice. Propose a fix that addresses the principle, not the symptom. |
| **The Expansionist** | "Where else does this pattern appear?" | Look for similar issues across the codebase. Propose a fix that generalizes. Warn about half-measures. |
| **The McKinsey Consultant** | "What's the ROI?" | Weigh effort vs. impact. Push for the smallest change that captures most of the value. Identify what to defer. |
| **The Executor** | "How do we actually ship this safely?" | Concrete steps: branch strategy, migration ordering, rollback plan, what to test, who to notify. Calls out hand-waving. |

Council format inside `02_council.md`:

```markdown
# Council on GBC-N

## Round 1 — Independent positions

### The Contrarian
[200-400 words. Steelman the case for not fixing or for a much smaller fix.]

### The First-Principles Thinker
[200-400 words. Architectural reframing.]

### The Expansionist
[200-400 words. Where else does this happen? What's the generalized fix?]

### The McKinsey Consultant
[200-400 words. Effort/impact, MVP scope, what to defer.]

### The Executor
[200-400 words. Concrete plan, rollback, tests.]

## Round 2 — Anonymous peer review

Re-label the five positions as A/B/C/D/E (in a different order than Round 1) and have each advisor critique the other four. They don't know which is which. Each advisor writes 100-150 words of critique.

## Round 3 — Verdict

Synthesize. Pick:
- **The chosen approach:** A clear, decisive paragraph.
- **What was rejected and why:** One sentence per rejected proposal.
- **Open risks:** 2-4 risks that survive the synthesis.
- **Definition of done:** Bullet list — what observable state must be true for this issue to be considered resolved.
```

If two or more advisors strongly disagree on something foundational (e.g. "fix in the database vs fix in the frontend"), do not paper over it. Surface the disagreement and explain why you chose one side.

#### 2D. Resolution attempt → `03_resolution.md` and a git branch

Now act on the verdict.

1. Create a new branch from `main`: `git checkout -b gbc/<issue-key>-<slug>`.
2. Make the code changes. Follow the codebase's existing conventions — match the style of nearby code, use existing utilities, don't introduce new dependencies unless absolutely necessary.
3. Write or update tests where reasonable. If the fix touches:
   - **A hook:** add a unit test for the hook's pure logic.
   - **An RLS policy or RPC:** add a SQL test if the project has them, otherwise add a manual test plan to the report.
   - **A UI component:** add a smoke test if a test framework is present.
4. Run whatever the project's check command is (look for `npm run lint`, `npm run typecheck`, `npm test`, `pnpm build`, etc. in `package.json`). Capture the output.
5. Commit. Use the commit message format above.
6. Generate the diff: `git diff main...HEAD > gbc-audit/<issue-key>/diff.patch`.
7. Write `03_resolution.md` with:
   - **Files changed:** list
   - **Summary of changes:** 1 paragraph
   - **What was deferred:** anything from the council verdict you didn't ship and why
   - **Test results:** verbatim output of lint/typecheck/test commands
   - **Manual verification steps:** what a reviewer should click through to validate
   - **Rollback:** the exact git command to revert
   - **Status:** one of `resolved`, `partially-resolved`, `blocked`, `wont-fix`

#### 2E. Top-level report → `REPORT.md`

Combine the three phases into a single readable artifact. Structure:

```markdown
# GBC-N: <summary>

**Severity:** <High/Medium/Low>  ·  **Category:** <category>  ·  **Status:** <status>
**Branch:** `gbc/<key>-<slug>`  ·  **Jira:** <url>

## TL;DR
[3-4 sentences: what the issue was, what you found, what you did.]

## Root cause
[Short version — link to 01_root_cause.md for full investigation.]

## Council verdict
[The chosen approach paragraph from 02_council.md, plus the definition of done.]

## What changed
[Files + 1-paragraph summary, link to diff.patch.]

## What didn't change
[Anything deferred, blocked, or out of scope.]

## Risks and follow-ups
[Open risks from the verdict + any new ones surfaced during implementation.]
```

#### 2F. Update the master index

Append a row to `gbc-audit/_INDEX.md`:

```
| GBC-N | High | Cross-cutting — Security | resolved | gbc/gbc-n-slug | [link](./GBC-N/REPORT.md) |
```

### PHASE 3 — Cross-issue synthesis

After working through all 65 issues, write `gbc-audit/_SUMMARY.md` covering:

1. **Patterns you saw repeatedly** — e.g. "12 issues all stem from hooks doing business logic in the browser instead of RPCs."
2. **Foundational fixes that resolved multiple issues** — list them with which issue keys they fixed.
3. **Issues that are blocked or need product/design input** — flag them clearly.
4. **Recommended ordering for review/merge** — which branches to merge first, second, third.
5. **Items the user should manually validate before merging** — anything you couldn't fully test (e.g. RLS changes in a production-like Supabase env).
6. **Tech debt themes** — 3-5 themes the team should tackle structurally beyond these issues.

---

## Rules of engagement

### When to pause and ask the user

You're running autonomously, but stop and ask if any of these are true:

- A fix would require new infrastructure (a new Supabase function, a new third-party library, a new database table).
- A fix would change a public API contract or data shape that other systems consume.
- The issue description is ambiguous in a way that materially changes the fix (e.g. "fix the audit trail" — but there are three different audit trails in the codebase).
- A high-severity issue can't be confirmed from the code (the description references files or behavior you can't find).
- Tests fail in a way you can't explain after one round of investigation.
- The fix would touch more than ~30 files in a single issue (suggests scope is wrong).

When you pause, write what you found and what you need into a short note in the issue folder, mark the index status as `needs-input`, and move on to the next issue. Don't block the whole run on a single ambiguous issue.

### Token and time discipline

- Cap each issue's work at roughly **1 hour of wall time** unless it's clearly a critical security issue.
- If an investigation balloons, write what you have, mark status `partially-resolved` or `needs-input`, and move on.
- Council debates should be ~2,000-3,000 words total per issue, not novels.
- Use `git stash` aggressively if you discover mid-fix that you're on the wrong track. Don't pile up half-finished changes.

### Quality bar

- **Every code change must pass the project's lint and typecheck.** No exceptions. If it doesn't, the issue's status is `blocked` and the branch should not be considered ready.
- **Don't fabricate test results.** If you couldn't run a command, say so explicitly in the report.
- **Don't fix things outside the issue's scope** unless the council explicitly recommended it. Drive-by changes pollute diffs.
- **Don't `// @ts-ignore` your way out of a TypeScript problem.** If you have to, the council should debate that explicitly.
- **Match existing code style.** Don't reformat files you're touching beyond your change.

### Multi-tenant and security issues — extra caution

For any issue tagged `Security`, `Multi-tenant`, `Cross-tenant`, `RLS`, or `Data Integrity`:

- The Executor advisor must produce a verification plan that explicitly includes "verify org A cannot read/write org B's data" with concrete steps.
- The diff must not introduce any code path that bypasses RLS, even temporarily.
- If a fix touches RLS policies, the report must include the before-and-after SQL with comments explaining the security model.
- Default to **fail-closed** behavior — if a check is ambiguous, deny rather than allow.

### What success looks like

When the run finishes, the user should be able to:

1. Open `gbc-audit/_INDEX.md` and see a status row for all 65 issues.
2. Open any `REPORT.md` and understand in 90 seconds what was done and why.
3. Run `git branch --list 'gbc/*'` and see one branch per resolved issue, each independently mergeable.
4. Read `_SUMMARY.md` and walk into a team meeting with a clear narrative about codebase health.

---

## Specific guidance from issue patterns

A few notes based on the shape of this backlog:

- **Many issues describe symptoms of the same root cause.** "Hooks do too much logic in the browser" (GBC-1), "performance bottleneck on RLS" (GBC-2/3), "ILike search bottleneck" (GBC-14), and several screen-level issues are all variations on **"work happens client-side that should happen in Postgres."** When you fix the foundation, link forward to the screen-level issues that are now reduced or resolved.

- **The 26 Financial Suite screen issues likely share a template structure.** After resolving 2-3 of them, you'll have a pattern. Apply it consistently. Note in `_SUMMARY.md` if a refactor at the parent level would reduce the per-screen work.

- **GBC-30 (Accounting screen) has no description.** Don't fabricate one. Treat it as `needs-input`, document what you'd want to know, and move on.

- **The "Cache Bleeding" tenant security issue (GBC-28) and "Cross-Tenant Storage Leakage" (GBC-17) are the highest-blast-radius items in the list.** Process them first. If either reproduces, escalate immediately.

- **For TypeScript `as any` issues (GBC-19, GBC-26):** don't try to fix all of them in one issue. Pick the highest-risk usages, fix those, and document the rest as a follow-up item.

---

## Begin

Start with PHASE 0. Print the stats. Then begin PHASE 1 triage. Pick the first issue and start PHASE 2 — show me the root-cause investigation before moving on, so I can confirm we're aligned on tone and depth. After issue #1 you don't need to wait for confirmation; continue autonomously per the rules above.
