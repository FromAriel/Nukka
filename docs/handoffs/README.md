# Handoffs

Handing work from one agent session to the next is standard procedure on this project. Long sessions get expensive and lose focus, so each session ends by writing down what the next one needs. The next one starts by reading it.

## When starting a session

1. Read `CLAUDE.md`.
2. Read the **newest** handoff in this folder (files are named `YYYY-MM-DD-topic.md`).
3. Read only the planning docs the task needs.

## When ending a session (or switching agents)

Write a new file here named `YYYY-MM-DD-topic.md`, using these sections:

- **What was done**: commits, branches, PRs, and the current state of `main`.
- **What we learned**: results, measurements, and decisions made in conversation.
- **What's left**: known gaps, bugs and simplifications.
- **What's next**: the recommended next task, written so it can be pasted as a prompt.
- **Notes**: anything you discovered that isn't clearly written in the planning docs. Include tool quirks, environment gotchas, the user's preferences, why something odd is the way it is, and traps you fell into.

Keep it short and factual. Link to the planning docs rather than repeating them. Older handoffs stay as history; only the newest one is the starting point.
