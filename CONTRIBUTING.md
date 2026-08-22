# Contributing to M-Spa for Homey

Thanks for helping out. This app runs on other people's hot tubs, so a few rules
exist to keep contributions reviewable and safe to publish.

## English is the project language

**All code and code-adjacent text must be written in English.** No exceptions.

This covers:

- Identifiers: variables, functions, classes, capability IDs, Flow card IDs, file names
- Code comments and JSDoc
- Log and error messages (`this.log(...)`, `this.error(...)`, thrown `Error` messages)
- Commit messages, branch names, pull request titles and descriptions
- Shell scripts, workflow files, and any documentation in the repository

The one place other languages belong is **user-facing strings**, and those never
get hardcoded — they go into the locale files and Homey Compose JSON:

- `locales/<lang>.json` for the app settings page (`homey.__('key')`)
- `title` / `titleFormatted` / `hint` / `placeholder` objects in
  `.homeycompose/**` and `drivers/mspa/driver.compose.json`
- The `LABELS` table in `widgets/mspa-panel/public/index.html`, which does its
  own lookup because widgets do not have access to `homey.__`

`en` is required for every user-facing string. `de`, `no` and `sv` are welcome
and should be kept complete when you touch a card that already has them.

Why: reviewers, future maintainers and Homey's app reviewers do not all read the
same languages. A comment in German next to a subtle capability workaround is
effectively an undocumented workaround.

## Keep your local setup out of the repository

Do not commit anything that only works on your machine or only concerns your
workflow:

- IP addresses, hostnames, or network notes for your own Homey
- Paths to private notes, personal task files, or sync folders
- `.gitignore` entries for files that exist only in your working copy
- Personal helper scripts that no one else can run

`install-local-homey.sh` is the supported local workflow: it builds and runs
`homey app install`, letting the Homey CLI discover your Homey itself. Extend it
in a machine-independent way or keep your variant untracked.

App metadata in `.homeycompose/app.json` — `author`, `support`, `source`,
`homepage`, `bugs` — must always point at `MagTer/homey-mspa`. If you work from
a fork, do not carry your fork's URLs into a pull request. Add yourself under
`contributors` instead.

## Do not silently change existing Flow cards

Users have saved Flows that reference these cards by ID. Changing what a card
*means* rewrites their automations without them touching anything.

- Never repurpose an existing card ID. Changing `temperature_above` from
  measured water temperature to target temperature is a breaking change even
  though nothing in the code looks broken.
- If you need different semantics, add a **new** card (as `temperature_equals`
  did) and state the semantics in its `hint`.
- Widening or narrowing `min`/`max` on an argument can invalidate thresholds
  users already saved. Call it out in the pull request.
- Comparison operators are part of the contract. `>=` and `>` are different
  cards to a user with a Flow that fires on the boundary.

Renaming a card's *title* or adding translations is fine — that is presentation,
not semantics.

## Capabilities

Optional capabilities (`mspa_jets`, `mspa_ozone`, `mspa_uvc`, `bubble_level`)
are driven by the model profile in `lib/mspa-api/profiles.ts`.

- Removing a capability is destructive: the user loses history and any Flow
  referencing it. Only remove when the profile is a recognized series that
  genuinely lacks the feature.
- Force-adding a capability is equally wrong when the profile is known — it
  leaves dead controls in the UI. Force-add is reserved for the unknown
  (`Standard`) profile, where the profile itself is the unreliable part.
- Register capability listeners only for capabilities that exist, otherwise
  Homey throws `invalid_capability`.

## Before you open a pull request

```bash
npm ci
npm run typecheck     # must be clean — both tsconfigs, see below
npm test              # must be green
npm run coverage      # optional; prints per-file coverage
npx homey app build   # regenerates app.json from .homeycompose
npx homey app validate --level publish
```

`npm run typecheck` runs two configs. `tsconfig.json` compiles the TypeScript
into `.homeybuild/`. `tsconfig.check.json` type-checks the plain JavaScript the
build ignores — `api.js` and `widgets/**/*.js` — and never emits. Both must pass;
CI runs both.

If you changed anything under `.homeycompose/` or `driver.compose.json`, commit
the regenerated `app.json` with it. That file is generated, but it is tracked —
the Homey CLI will not run without it — and CI fails if it has drifted from the
Compose sources. Never edit `app.json` by hand.

### Testing

Add tests for behaviour you change. The Flow condition semantics in
`test/drivers/mspa/driver.test.ts` and the capability rules in
`test/drivers/mspa/device.test.ts` are there to lock behaviour that has broken
before — if your change makes one of them fail, that is a conversation for the
pull request, not a test to update quietly.

Four rules earned their place by something passing green while being wrong:

**Import the code under test; never reimplement it.** A test that recomputes
the expected value with its own copy of the logic asserts only that it agrees
with itself. `test/mspa-api/signature.test.ts` did exactly this for the request
signing scheme — the file looked thorough and would have passed while the real
signer was broken, which would have locked every user out of their spa. Fixed
vectors, computed by hand or by a different tool, beat a recomputation.

**Registration is not behaviour.** Asserting that a Flow card was registered
says nothing about what it does. Call the run listener with real arguments and
assert what comes back. Twelve of seventeen cards were registration-only until
this was written down.

**Check that a new test can fail.** Break the code it covers — invert a
comparison, delete a guard — and confirm the test goes red before you commit it.
Several tests in this repository passed against deliberately broken code: a
`vi.advanceTimersByTime` assertion against the widget's interval measured
nothing at all, because vitest's fake timers patch `globalThis` and the widget
calls the jsdom window's timers.

**Cover the JavaScript too.** `api.js`, `widgets/mspa-panel/api.js` and the
script inlined in `widgets/mspa-panel/public/index.html` ship to users exactly
like the TypeScript does. The widget frontend is tested by loading the page into
jsdom (`test/widgets/mspa-panel-ui.test.ts`), so the inline script needs no
restructuring to be covered.

The suite still cannot see everything. Anything touching the real M-Spa cloud,
Homey's own SDK behaviour, or how the widget renders on a physical dashboard has
to be verified by installing the app — `npm run install:homey` — and the pull
request should say that is what you did.

Keep commits focused. A pull request that adds a feature should not also
reformat unrelated files, change app metadata, or bump the version.

## Versioning and changelog

**Do not edit `version` or `.homeychangelog.json` by hand.** Releases are cut by
the `Version` workflow in GitHub Actions, which bumps the version, writes the
changelog entry, tags the commit, and triggers publishing to the Homey App Store.
Hand-written version bumps in a pull request will be asked to be removed.

Describe your change in the pull request instead; the changelog text is written
at release time from what actually shipped.

**One version, one note.** Write the entry for the version being cut and nothing
else — never fold an earlier version's notes into a later one, even when the
earlier version was pulled from certification and looks like it will never reach
anyone. The App Store shows the whole chain: the changelog modal on the app page
lists every version's entry, and `.homeychangelog.json` ships inside the bundle
with all previous entries intact. Folding produces a visible duplicate, and it
cannot be undone afterwards — a later release adds an entry, it never removes
one, and there is no CLI or web action that deletes a published version. Verified
2026-08-22, after v1.0.8 shipped carrying a repeat of v1.0.7's note.

## Commit messages

Conventional Commits, in English:

```
feat(flow): add condition for exact target temperature
fix(device): only force-add optional capabilities for unknown models
chore: update app metadata
```

Explain *why* in the body when the change is not self-evident, especially for
workarounds against the M-Spa cloud API.
