# CLAUDE.md

Guidance for Claude Code when working in this repository.

## What this is

A Homey app (SDK v3, TypeScript, Homey Compose) that controls M-Spa hot tubs
through the M-Spa cloud API. It is published on the Homey App Store, so changes
reach other people's hardware — correctness matters more than speed here.

Read [CONTRIBUTING.md](CONTRIBUTING.md) as well; it holds the rules that apply
to any contributor. This file covers what is specific to working here with an
agent.

## Commands

```bash
npm ci                      # install
npm run typecheck           # both tsconfigs — must be clean
npm test                    # vitest
npm run coverage            # per-file coverage
npx homey app validate --level publish
npx homey app run           # run against a paired Homey
npm run install:homey       # build + homey app install
```

There is no linter and no formatter. Match the surrounding style.

## Layout

| Path | Role |
| --- | --- |
| `app.ts` | Owns the single `MspaApiClient`; rebuilds it when settings change |
| `api.js` | Settings-page endpoint that verifies credentials before saving |
| `drivers/mspa/driver.ts` | Registers every Flow trigger, condition and action |
| `drivers/mspa/device.ts` | Capabilities, profile application, polling, commands |
| `lib/mspa-api/` | `client` (auth, signing, retries), `throttle` (400 ms), `shadow` (parsing), `profiles` (model → features), `errors`, `types` |
| `.homeycompose/` | App manifest, capabilities and Flow cards — the real source |
| `locales/` | Settings-page strings for `homey.__` |
| `widgets/mspa-panel/` | Dashboard widget: `api.js` backend, `public/index.html` frontend |
| `test/` | Vitest suites; the Homey SDK stub is the `vi.mock` in `test/setup.ts` — the root `__mocks__/homey.ts` is not wired to anything |

## Things that will bite you

**`app.json` is generated but tracked.** Edit `.homeycompose/**` and
`drivers/mspa/driver.compose.json` — never `app.json` itself. Compose merges
them into the root `app.json` on every build.

The root file is committed anyway, because the Homey CLI treats it as the entry
point and refuses to do anything without it — including composing it. A clone
without `app.json` cannot even run `homey app build`. After changing anything
under `.homeycompose/`, run `npx homey app build` and commit the regenerated
`app.json` alongside your change; CI fails if the two drift apart.

**Flow card IDs are a public contract.** Users have saved Flows referencing
them. Changing what an existing card *means* — the capability it reads, the
comparison operator, the argument range — silently rewrites their automations.
This has already happened once with `temperature_above`/`temperature_below`.
Add a new card instead. Renaming titles or adding translations is fine.

**Capability add/remove is destructive.** Removing a capability drops the user's
history and breaks Flows that reference it. The rules encoded in
`device.ts` and `profiles.ts`:

- Remove only when the profile is a *recognized* series that genuinely lacks the
  feature.
- Force-add only when the profile is the unknown `Standard` fallback, where the
  profile itself is what's unreliable.
- `DEFAULT_PROFILE` deliberately claims ozone and UVC. That looks wrong in
  isolation; it is there because a wrongly-stripped capability used to be
  unrecoverable.
- Register capability listeners only for capabilities that exist, or Homey
  throws `invalid_capability`.

**Shadow temperatures are halved.** `parseShadow` divides `water_temperature`
and `temperature_setting` by 2 to get Celsius. Boolean fields go through
`asOn()` because the API is inconsistent about `1` vs `true` vs `"1"`.

**Version and changelog are workflow-owned.** `.homeycompose/app.json`,
`package.json` and `.homeychangelog.json` are written by the Version workflow.
Do not bump them in a change.

**English only**, including comments and log messages. User-facing text goes
through `locales/`, the Compose `title`/`hint` objects, or the widget's `LABELS`
table — never hardcoded.

## What the suite can and cannot see

Run `npm run coverage` for the current numbers; do not trust a figure written
down here. Everything that ships is now typechecked and covered, including the
plain JavaScript: `npm run typecheck` runs `tsconfig.json` for the TypeScript
and `tsconfig.check.json` for `api.js` and `widgets/**/*.js`.

The widget's inline script is exercised by loading `index.html` into jsdom
(`test/widgets/mspa-panel-ui.test.ts`), so changes there are testable without
restructuring how the widget loads — which is deliberate, since a change to
widget loading cannot be verified without a real Homey.

Green still does not cover:

- The real M-Spa cloud. Every test mocks `fetch`. Shadow field semantics —
  `heat_state`, leftover `bubble_level`, anything firmware-dependent — are
  assumptions until observed on a device.
- How the widget renders on a physical dashboard. jsdom asserts the DOM, not
  layout, and not whether Homey serves the page as expected.
- Homey SDK behaviour. `test/setup.ts` is a stub; `invalid_capability`, timer
  semantics and pairing all behave for real only on hardware.

For those, install the app (`npm run install:homey`) and say that is how you
verified it.

Two traps worth knowing before writing tests here:

- vitest's fake timers patch `globalThis`, not the jsdom window. An interval
  assertion using `vi.advanceTimersByTime` against widget code measures nothing
  and passes anyway. The widget tests install their own control over the page's
  `setInterval`.
- `const` at the top level of a classic script is not a window property, so
  `LABELS` has to be reached with `win.eval('LABELS')`.

Check that a new test can fail before trusting it: break the code it covers and
confirm it goes red.

## Polling

Idle poll every 15 minutes (`900000` ms). After a command, rapid-poll every
5 seconds for 30 seconds, then fall back. Commands also mirror their value onto
the capability optimistically so Flow conditions see the new state before the
next poll. Keep this shape — it exists to stay inside M-Spa's cloud limits.
