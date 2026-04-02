# Contributing to TheirStory Portals

Welcome, and thank you for your interest in contributing to TheirStory Portals! This document explains how you can help and what to expect from the process.

## Table of Contents

- [Help Others](#help-others)
- [Analyze Issues](#analyze-issues)
- [Report an Issue](#report-an-issue)
- [Contribute Code](#contribute-code)
- [Contributor License Agreement](#contributor-license-agreement)
- [Contribution Content Guidelines](#contribution-content-guidelines)
- [How to Contribute — The Process](#how-to-contribute--the-process)
- [Making a Pull Request](#making-a-pull-request)

## Help Others

You can help TheirStory Portals by supporting other users. Check GitHub Discussions or the issue tracker for questions where your experience might help.

## Analyze Issues

Analyzing issue reports takes time and any help is welcome. Visit the GitHub issue tracker and look for open issues labeled `help wanted` or `bug`. You can contribute by adding context, reproducing the issue, or proposing a fix.

## Report an Issue

If you find a bug — behavior of TheirStory Portals that contradicts your expectation — you are welcome to report it. Please follow the guidelines below so we can address it effectively.

### Before Submitting

Check the issue tracker to confirm the bug has not already been reported. Duplicate reports slow things down for everyone.

### Quick Checklist for Bug Reports

- It is a real, current bug (not a usage question)
- It has not already been reported
- It is reproducible
- It has a clear summary
- It includes enough detail to understand and reproduce
- It includes a minimal example where possible
- It uses the issue template

### Issue Handling Process

When an issue is reported, a committer will review it and either confirm it as a real bug, close it if it is not an issue, or ask for more details. Issues confirmed as real bugs are closed once a fix is committed.

### Reporting Security Issues

Please do not report security vulnerabilities in the public issue tracker. Use GitHub Security Advisories to report privately. This allows us to address the issue before it can be exploited.

### Issue Labels

- `bug` — A confirmed bug in the code
- `feature` — A request for new functionality or an enhancement
- `design` — Relates to UI or UX
- `help wanted` — Approved and open for community contribution
- `wontfix` — Acknowledged but will not be fixed

Labels can only be set and modified by committers.

### Issue Reporting Disclaimer

Good bug reports are genuinely valuable. Our capacity is limited, so we may close reports that are insufficiently documented in favor of those that are clearly reproducible and well-described. Filing a report does not guarantee a fix — TheirStory Portals is open source and comes without warranty.

## Contribute Code

We welcome code contributions to fix bugs or implement new features. Before diving in, there are a few important things to understand:

- You must agree to the Contributor License Agreement (CLA), which governs how your contributions are licensed to TheirStory and the community. See the Contributor License Agreement section below.
- Your code must meet our quality and style standards. See Contribution Content Guidelines below.
- Not all contributions can be accepted. Some features may be better suited to a third-party integration, or may not align with the project's direction. For feature work especially, open an issue to discuss your intent before building — this saves time for everyone.
- For features, wait for approval before coding. A core team member must approve the feature request (indicated by removal of the 🚨 needs approval label) before you begin implementation. For bugs, documentation, and performance fixes, you can start immediately.

## Contributor License Agreement

When you contribute to TheirStory Portals, your contribution is licensed to TheirStory, Inc. under the terms of our Contributor License Agreement (CLA).

TheirStory Portals uses CLA Assistant to manage signatures. When you open a pull request, CLA Assistant will post a comment with a link to review and sign the CLA. Click the link, review the agreement, and accept it if you agree. Your acceptance is recorded against your GitHub account and applies to all future contributions.

## Contribution Content Guidelines

- Apply a clean coding style consistent with the surrounding code
- Use 4 spaces for indentation (unless the file you are modifying consistently uses tabs)
- Follow the naming conventions used in the surrounding code (camelCase for variables and functions, PascalCase for classes and components)
- Do not use `console.log()` — use the logging service
- Run ESLint and ensure it passes before submitting
- Comment non-trivial logic
- Be mindful of performance and memory — properly destroy objects when no longer needed
- Write unit tests for your changes
- Do not make breaking changes to public API methods or properties

### File Naming Conventions

Keep names specific and consistent with the surrounding codebase. Avoid generic names like `utils.ts` or `helpers.ts`. Class-based files should use PascalCase matching the exported class name.

## How to Contribute — The Process

- Validate your idea first. Check the issue tracker to confirm your bug or feature is not already addressed. For feature contributions, open an issue and wait for a core team member to approve it before building.
- Fork the repository and create a branch for your change.
- Make your changes following the content guidelines above. Keep your change focused on a single concern — one bug fix, one feature, or one refactor.
- Write a good commit message that covers the problem your change solves, the effect on the user experience, and the technical details of what changed, including any trade-offs or edge cases.

If your change fixes a GitHub issue, include the following line (no colon after `Fixes`):

```text
Fixes #(issueNumber)
```

- Open a pull request. CLA Assistant will comment with a link to sign the CLA if you have not already done so.
- Wait for review. Maintainers will review your PR and may request changes. Depending on complexity, this may take time. We will notify you once approved.
- After approval, we will merge your change and close the PR. You are welcome to delete your branch at that point.

## Making a Pull Request

### Keep PRs Small and Focused

Large PRs are harder to review and more likely to introduce errors. We strongly encourage smaller, self-contained PRs:

- Size: Aim for under 500 lines changed and under 10 files modified (excluding documentation, lock files, and auto-generated files)
- Single responsibility: Each PR should address one concern — one feature, one bug fix, or one refactor
- Split large changes: If your task requires extensive changes, break it into multiple PRs that can be reviewed and merged independently

When splitting, a useful order is: database or schema changes first, then application logic; infrastructure before features; preparatory refactoring before new functionality.

### Write a Useful PR Description

Even if the code changes are minor, a short written summary helps reviewers understand the intent quickly. A good PR description covers:

- What you changed and why
- How you tested it (e.g., "Tested locally with mock data and confirmed the flow works on staging")
- Any trade-offs, edge cases, or temporary workarounds worth flagging for future reference
- Links to related issues or prior PRs that add context

If the task originated from a private conversation (e.g., Slack or email), extract the relevant reasoning and include it in the PR. GitHub is a shared source of truth — reviewers and your future self will thank you.

### PR Checklist

- Check that an open issue or approved feature request exists for this change
- Enable "Allow edits from maintainers" when creating the PR
- Reference the related issue using `Fixes #XXX` or `Refs #XXX` in the description
- Confirm ESLint passes (`yarn lint`)
- Confirm a full production build succeeds (`yarn build`)
- Unit tests written and passing
- Branch is up to date with main
- CLA signed via CLA Assistant

_Questions about contributing? Open an issue or reach out at help@theirstory.io._
