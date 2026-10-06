# Security policy

DeezNote is end-to-end encrypted, so flaws in its cryptography, key handling or anything that could expose note contents matter most.

## Reporting a vulnerability

Please report vulnerabilities privately through GitHub: open the repository's **Security** tab and choose **Report a vulnerability**. Don't open a public issue.

Include what you found, how to reproduce it, and what an attacker could do with it. You'll get a reply within a week. Once a fix is released, the report can be published, with credit if you'd like it.

## Scope

In scope:

- The web app and API in this repository
- The encryption design: anything that lets the server, or anyone else, read or tamper with notes undetected
- Authentication, sessions and account deletion
- The live service at deeznote.103-253-146-20.sslip.io, tested only with accounts you own

Out of scope:

- Denial of service, load testing or spam against the live service
- Attacks that need a compromised device or browser
- Findings that only affect outdated browsers

## Known limitations

These are documented in the [README](README.md#limits-of-the-threat-model) and don't need reporting: the server delivers the app's code, a malicious server could serve an older version of a note, and note sizes and save times are visible to the server.

DeezNote has not had an independent security audit.
