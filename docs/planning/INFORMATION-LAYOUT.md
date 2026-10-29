# Information layout: aligning homey-mspa with the shared rule

**Status 2026-10-29: PLAN, unsigned. Nothing below is built.** Origin: operator, 2026-10-29
— *"README i rooten är främst för människor, agents.md är projektspecifika tillägg."* The
rule is agent-config `proposals/2026-10-29-project-information-layout.md` (U1 there,
unsigned). **Runs only after that U1 is signed.**

## 1. What is here, read 2026-10-29 at `aec5781`

`CLAUDE.md` 1 039 words (What this is, Commands, Layout, Things that will bite you, What the
suite can and cannot see, Polling) — already the shape the rule asks for, and within budget.
No `AGENTS.md`, no skills, no position file.

## 2. Unit

Gates: `npm test` (vitest) and `npx homey app validate --level publish`.

### U1 — rename
- **Files.** `git mv CLAUDE.md AGENTS.md`; new `CLAUDE.md` = `@AGENTS.md`; references
  (`git grep -n CLAUDE.md`); `.gitignore` (`.agent-state.md`). There is no `.homeyignore`
  (`ls`, 2026-10-29), so compare the publish bundle's file list before and after.
- **Acceptance.** the grep finds no stale reference; `git check-ignore .agent-state.md`; gates
  green; the publish bundle's file list unchanged.
