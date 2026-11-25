# How Siduri is made

**Siduri is developed with AI.** This page says what that means, so you can decide whether you want to use it.

## Who wrote what

- **Almost all of the code, the automated tests and this documentation were written by an AI coding assistant**, [Claude Code](https://claude.com/claude-code) by Anthropic.
- **A human maintainer directs the project**: they decide what Siduri should do, describe features and changes, try the results on real brew days and decide what goes in.
- Commits written with the assistant say so in a `Co-Authored-By: Claude …` line, so the history shows which changes were made this way.

## What that means for you

- **No independent review.** No professional developer or security expert outside the project has reviewed or audited the code. That includes sign-in, sessions, the optional database encryption and the [access tokens for AI assistants](mcp.md). They use established building blocks (Argon2 password hashing, SQLCipher, hashed tokens) and are covered by automated tests, but the tests were written by the same AI.
- **Check the numbers that matter.** The brewing calculations (gravity, bitterness, colour, volumes, water chemistry) are tested against published reference values, but a wrong salt addition or strike temperature costs you a batch. If something looks off, trust your own judgement and measurements.
- **RAPT doesn't document its data stream's messages.** The app reads them leniently, and each device's **Last messages** show what arrived; see [Smart devices](devices.md).
- **Mistakes are possible** that nobody has noticed yet, as in any software, and AI-written code can be wrong in ways that look convincing.
- **Keep your own [backups](backups.md).**

If you would rather not use AI-written software, this is the point to stop. No hard feelings.

## Found a problem?

Please open an issue on GitHub, especially for anything security-related or a calculation that's wrong. Reviews of the code by people who know what they're doing are very welcome.
