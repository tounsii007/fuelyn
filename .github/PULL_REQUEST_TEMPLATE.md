<!--
  Phase E — PR template.
  Keep entries terse. Reviewers read PR descriptions in 30 seconds.
-->

## What

<!-- 1-2 sentences. The "what", not the "why". -->

## Why

<!-- The user-facing or operational reason this change exists. Link to
the issue / spec when relevant. -->

## How

<!-- Bullet list of the meaningful pieces. Skip trivial mechanics. -->

- 

## Risk & rollback

- **Blast radius**: <!-- frontend-only / single backend service / data migration / public API contract -->
- **Rollback**: <!-- git revert is safe / requires DB migration revert / requires container restart -->

## Verification

- [ ] Unit tests added or extended
- [ ] Manually exercised in dev (URL or steps below)
- [ ] No noisy logs introduced (`grep -E 'console\.log|System\.out'` clean)
- [ ] If touching the public API: gateway contract tests still green

## Out of scope / follow-ups

<!-- Anything explicitly NOT included that a reviewer might expect. -->
