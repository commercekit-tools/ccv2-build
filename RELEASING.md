# Releasing

**UNRELEASED — NO RELEASE UNTIL THE COMPLETE ACTION SUITE IS SANDBOX-VERIFIED.**

Implementation may merge after review. Do not create `v1.0.0`, create or move `v1`, publish a GitHub Release or Marketplace listing, or publish an npm package while these gates remain open.

- [ ] Build Action implementation reviewed and merged; main CI passes
- [x] Build success Sandbox scenario passes
- [x] Build failure Sandbox scenario passes
- [x] Build nonterminating/timeout Sandbox scenario passes
- [x] Build transient/rate-limit and create-error Sandbox scenarios pass
- [ ] Deploy Action implementation reviewed and merged
- [ ] Deployment Sandbox scenarios pass
- [x] Real build producer event validates and renders through notify
- [ ] Real deploy producer event validates and renders through notify
- [ ] Complete build → deploy → notify workflow verified
- [ ] Live Slack smoke passes
- [ ] Live Teams smoke passes
- [ ] Marketplace name `CommerceKit CCv2 Build` validated by owner in release UI
- [ ] Coordinated v1 release owner approval recorded

The manual Sandbox workflow requires owner approval after PR review and local/CI success. The five scenarios passed locally with the same guarded scripts and bundled Action under explicit owner approval on 2026-11-09; see [validation evidence](docs/build-validation.md). GitHub-hosted dispatch was unavailable before the workflow existed on main. Do not infer live smoke authorization from permission to merge. No release workflow is provided here. Future maintainers must separately design and review coordinated version-tag and publication procedures after every gate passes.
