# Releasing

## Consistent reporting dependency

Notification-contract **0.0.6** is published through the owner-authorized
[package-only run 43678067818](https://github.com/commercekit-tools/action-kit/actions/runs/43678067818).
This consumer pins the exact registry artifact and bundles it normally with
ccv2-client 0.0.3 unchanged. Candidate-only validation switches are retired.
Normal full quality and hosted checks must pass on the current PR head before
its authorized source merge. See [reporting evidence](docs/consistent-reporting.md).
All remaining Action-release, provider/live validation and owner gates below
remain separate. Package publication does not create an Action tag or release.

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

The shared-package migration does not satisfy any additional live validation gate and does not authorize release. Notification-contract is exactly `0.0.6` and ccv2-client remains exactly `0.0.3`, both included in dist. Before approving a package upgrade, review the public contract, authentication/retry behavior, licenses, offline compatibility fixtures, standalone bundle test, and reproducibility. Existing Sandbox evidence describes the earlier implementation; live Sandbox verification of a migration requires separate owner authorization.
