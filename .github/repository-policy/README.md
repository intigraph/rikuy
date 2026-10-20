# Repository settings

These payloads describe Rikuy's repository configuration. They are inert source
files: CI does not apply them. Review a change to these settings after CI passes,
then use the normal authenticated GitHub CLI and read back each result:

```sh
gh api --method PUT repos/scbrown/rikuy/actions/permissions/workflow \
  --input .github/repository-policy/actions-permissions.json
gh api repos/scbrown/rikuy/actions/permissions/workflow
gh api --method PUT repos/scbrown/rikuy/branches/main/protection \
  --input .github/repository-policy/main-protection.json
gh api repos/scbrown/rikuy/branches/main/protection
```

The token default stays read-only. The reviewed release-please workflow requests
its own write permissions and needs permission to create its release PR. Enabling
this repository setting also permits Actions approval; it does not supply an
independent source review or authorize merging a release PR.

Main requires the `check` CI context and a pull request with zero GitHub approval
votes required. Independent source review follows the change's risk tier.
Administrator enforcement, force-push refusal and deletion refusal remain enabled.
Strict branch freshness is handled by the normal current-base merge preflight.

Before applying a change, retain the current API responses and a rollback. Stop
on an indeterminate response and read the same endpoint before retrying. Do not
overwrite another actor's configuration. These settings do not authorize service
deployment, trust changes, credentials or a release.
