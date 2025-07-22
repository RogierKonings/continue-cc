# GitHub Repository Settings Configuration Guide

## Branch Protection Rules

To configure branch protection for the main branch:

1. Go to Settings → Branches
2. Add rule for `main` branch with these settings:
   - ✅ Require a pull request before merging
   - ✅ Require approvals (1)
   - ✅ Dismiss stale pull request approvals when new commits are pushed
   - ✅ Require status checks to pass before merging
   - ✅ Require branches to be up to date before merging
   - ✅ Require conversation resolution before merging
   - ✅ Include administrators

## Required Status Checks

Configure these checks (will be available after workflows are created):
- `test / test (ubuntu-latest, 18.x)`
- `test / test (ubuntu-latest, 20.x)`
- `test / test (windows-latest, 18.x)`
- `test / test (windows-latest, 20.x)`
- `test / test (macos-latest, 18.x)`
- `test / test (macos-latest, 20.x)`
- `build / build`
- `lint / lint`

## Security Settings

1. Go to Settings → Security & analysis
2. Enable:
   - ✅ Dependency graph
   - ✅ Dependabot alerts
   - ✅ Dependabot security updates
   - ✅ Code scanning (CodeQL)
   - ✅ Secret scanning

## Dependabot Configuration

Create `.github/dependabot.yml` (see file in repo)

## Repository Settings

1. General settings:
   - Default branch: `main`
   - Features: Enable Issues, Projects, Wiki as needed
   - Merge button: Enable all merge types
   - Automatically delete head branches

2. Collaborators & teams:
   - Add team members as needed

3. Webhooks:
   - Configure for CI/CD notifications if needed