# Task: Verify ESPN-links fix across all non-Home pages and prepare release

## Goal
Confirm that the ESPN-links fix is present in the local source and built output for all pages (not just Home) so that running `npm run deploy` resolves the remaining 11-links display issue.

## Repository
- **Working directory:** `C:\Templar Archives\Basketball Bro\beer-league\site`
- **Relevant files:** Inspect git log/status and the shared navigation/header/ESPN-links component or page templates.

## Required behavior
- Home and all non-Home pages (Stats, Draft, Approvals, team pages) must use the updated ESPN-links logic rather than showing all 11 ESPN links.
- Local build must complete cleanly with zero errors.

## Allowed changes
- Read-only verification of source files and build output first.
- If non-Home templates were missed in the source fix, update only the ESPN-links rendering on those pages to match Home.

## Out of scope
- Do NOT touch the live stats or post-game NBA box score scripts.
- Do NOT change Home page collapsible sections, pet info card slot (8th slot), or Upcoming games placement.
- Do NOT run `npm run deploy` without explicit user confirmation after the build check passes.

## Project commands
- Working dir: `cd "C:\Templar Archives\Basketball Bro\beer-league\site"`
- Check git state: `git status` and `git log -n 3 --stat`
- Build check: `npm run build`
- Release (User-approved only): `npm run deploy`

## Handling uncertainty
- Inspect existing code in `site` before asking questions.
- Follow the exact ESPN-links convention already working on the Home page.

## Acceptance checks
- [ ] Confirmed latest ESPN-links fix is present in local working tree.
- [ ] Confirmed non-Home pages reference the fixed ESPN-links logic in the fresh build output.
- [ ] Ready for single `npm run deploy` execution.

## Return format
1. Files inspected or changed
2. Build output summary
3. Confirmation of whether non-Home pages now have the ESPN-links fix in the build artifact
4. Exact deploy command ready for approval
