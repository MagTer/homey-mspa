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
npx tsc --noEmit            # typecheck — must be clean
npm test                    # vitest, 91 tests
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
| `test/` | Vitest suites; `__mocks__/homey.ts` stands in for the SDK |

## Things that will bite you

**`app.json` is generated.** Edit `.homeycompose/**` and
`drivers/mspa/driver.compose.json`. The root `app.json` is gitignored and the
Homey CLI composes it on build. Never hand-edit it, and never commit it.

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

## Test coverage is uneven

`npm test` being green is weaker evidence than it looks:

- `tsconfig.json` includes only `lib/`, `app.ts` and `drivers/`. The widget
  (`widgets/mspa-panel/api.js` and its HTML) and the root `api.js` are plain
  JavaScript and are not typechecked or covered by any test.
- `test/mspa-api/signature.test.ts` reimplements the MD5 signing scheme with
  `crypto` instead of importing it from `client.ts`. It asserts its own copy, so
  it cannot catch a regression in the real signing code.

If you change the widget or the request signing, verify by other means and say
so rather than leaning on the suite.

## Polling

Idle poll every 15 minutes (`900000` ms). After a command, rapid-poll every
5 seconds for 30 seconds, then fall back. Commands also mirror their value onto
the capability optimistically so Flow conditions see the new state before the
next poll. Keep this shape — it exists to stay inside M-Spa's cloud limits.
