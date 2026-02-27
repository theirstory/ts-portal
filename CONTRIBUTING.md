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

## Help Others

You can help TheirStory Portals by supporting other users. Check the GitHub Discussions or issue tracker for questions where your experience might help.

## Analyze Issues

Analyzing issue reports takes time and any help is welcome. Visit the GitHub issue tracker and look for open issues labeled help wanted or bug. You can contribute by adding context, reproducing the issue, or proposing a fix.

## Report an Issue

If you find a bug — behavior of TheirStory Portals that contradicts your expectation — you are welcome to report it. Please follow the guidelines below so we can address it effectively.

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

Please do not report security vulnerabilities in the public issue tracker. Instead, use GitHub Security Advisories to report privately. This allows us to address the issue before it can be exploited.

### Issue Labels

| Label       | Meaning                                           |
| ----------- | ------------------------------------------------- |
| bug         | A confirmed bug in the code                       |
| feature     | A request for new functionality or an enhancement |
| design      | Relates to UI or UX                               |
| help wanted | Approved and open for community contribution      |
| wontfix     | Acknowledged but will not be fixed                |

Labels can only be set and modified by committers.

### Issue Reporting Disclaimer

Good bug reports are genuinely valuable. Our capacity is limited, so we may close reports that are insufficiently documented in favor of those that are clearly reproducible and well-described. Filing a report does not guarantee a fix — TheirStory Portals is open source and comes without warranty.

## Contribute Code

We welcome code contributions to fix bugs or implement new features. Before diving in, there are a few important things to understand:

1. You must agree to the Contributor License Agreement (CLA), which governs how your contributions are licensed to TheirStory and the community. See the Contributor License Agreement section below for details. Company contributors must also complete a Corporate CLA — see Company Contributors below.

2. Your code must meet our quality and style standards. See Contribution Content Guidelines below.

3. Not all contributions can be accepted. Some features may be better suited to a third-party add-on, or may not align with the project's direction. The more effort involved, the more important it is to validate your approach first — open an issue to discuss your intent before building.

## Contributor License Agreement

When you contribute to TheirStory Portals, your contribution is licensed to TheirStory, Inc. under the Apache License, Version 2.0, as described in our Contributor License Agreement (CLA). TheirStory Portals itself is distributed to the public under the GNU Affero General Public License v3.0 (AGPL-3.0). These are distinct: Apache-2.0 is the inbound license covering what you grant to TheirStory; AGPL-3.0 governs how the project is distributed to end users.
By agreeing to the CLA, you grant TheirStory the rights described in it, including the right to incorporate your contribution into other TheirStory products and services — including commercial or enterprise offerings — in addition to the open source project. TheirStory operates an open core model, and contributions may appear in enterprise features as well as the community edition.
TheirStory Portals uses CLA Assistant to manage CLA signatures. When you open a pull request, CLA Assistant will post a comment with a link to review and sign the CLA. Click the link, review the agreement, and accept it if you agree. Your acceptance is recorded against your GitHub account and applies to all future contributions. You will be notified if the CLA changes.

### Company Contributors

If you are contributing on behalf of your employer, your company must sign a Corporate Contributor License Agreement (CCLA) with TheirStory before your contribution can be accepted.
Contact help@theirstory.io to request a CCLA. If you are unsure whether your contribution falls within the scope of your employment, check with your employer before submitting.

## Contribution Content Guidelines

Please follow these guidelines when writing code:

- Apply a clean coding style consistent with the surrounding code
- Use 4 spaces for indentation (unless the file you are modifying consistently uses tabs)
- Follow the naming conventions used in the surrounding code (camelCase)
- Do not use console.log() — use the logging service
- Run ESLint and ensure it passes before submitting
- Comment non-trivial logic
- Be mindful of performance and memory — properly destroy objects when no longer needed
- Write unit tests for your changes
- Do not make breaking changes to public API methods or properties

## How to Contribute — The Process

1. Validate your idea first. Check the issue tracker to confirm your bug or feature is not already addressed. For feature contributions, open an issue to discuss your intent before building — this saves time for everyone.

2. Fork the repository and create a branch for your change.

3. Make your changes following the content guidelines above.

4. Write a good commit message that covers:

- The problem your change solves
- The effect on the user experience
- The technical details of what changed

5. If your change fixes a GitHub issue, include the following line in your commit message (no colon after "Fixes"):

```
Fixes #(issueNumber)
```

6. Open a pull request. CLA Assistant will comment with a link to sign the CLA if you have not already done so.

7. Wait for review. Maintainers will review your PR and may request changes. Depending on the complexity of the change, this may take time — our team has other responsibilities. We will notify you in the PR comments once the change is approved.

8. After approval, we will merge your change and close the PR. You are welcome to delete your branch at that point.

Questions about contributing? Open an issue or reach out at help@theirstory.io.
