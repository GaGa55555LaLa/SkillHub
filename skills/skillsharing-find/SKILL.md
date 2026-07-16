---
name: skillsharing-find
description: Search for skills shared on the team's SkillHub platform (org-wide skills and skills teammates have shared with you). Use when the user asks "is there a skill for X", "find a skill that does Y", wants to check what's already available before writing a new skill, or mentions SkillHub by name.
allowed-tools: Bash
---

# SkillHub Find

Search the team's SkillHub platform for existing skills before writing a new one from
scratch. Results only include skills the current user can actually see — org-wide
skills, plus anything personally shared with them.

## Setup (one-time)

Requires two environment variables, typically set in the user's shell profile:

- `SKILLHUB_URL` — the platform's base URL (e.g. `https://skillhub.example.com`,
  or `http://localhost:3000` for local dev)
- `SKILLHUB_TOKEN` — a personal API token, generated at `$SKILLHUB_URL/settings/tokens`

```bash
export SKILLHUB_URL="https://skillhub.example.com"
export SKILLHUB_TOKEN="skh_..."
```

If either variable is missing, `scripts/search.sh` fails with a clear error — tell the
user to set them up rather than guessing values.

## Usage

```bash
./scripts/search.sh "pdf"
```

Calls `GET $SKILLHUB_URL/api/v1/skills/search?q=<query>` and prints the JSON response:

```json
{ "skills": [{ "id": "...", "name": "...", "description": "...", "owner": "...", "source_type": "org | user" }] }
```

Present the results to the user as a short list: name, one-line description, and owner.
If they want to install one, hand its `id` to the `skillsharing-download` skill — don't
try to install skills yourself from this skill.

If the query returns an empty list, say so plainly. Don't invent skills that don't exist
in the results.
