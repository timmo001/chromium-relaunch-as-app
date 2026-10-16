# Agent instructions

- `tooling.yml` records the Omarchy release the native host was last reviewed against; the Tooling drift workflow opens a draft review pull request when it moves. After the review, move it with `mise run tooling:update <repo> <tag>`, never by hand; the `tooling-drift` skill has the steps.
