---
name: skillsharing-download
description: Download and install a skill from the SkillHub platform into ~/.claude/skills/. Use after skillsharing-find has located a skill's id, or when the user gives you a specific SkillHub skill id to install.
allowed-tools: Bash
---

# SkillHub Download

Download a skill from SkillHub and install it locally so it's usable in this and future
Claude Code sessions.

## Setup (one-time)

Same environment variables as `skillsharing-find`:

- `SKILLHUB_URL`
- `SKILLHUB_TOKEN` (generate at `$SKILLHUB_URL/settings/tokens`)

## Usage

```bash
./scripts/download.sh <skill_id>
```

This calls `GET $SKILLHUB_URL/api/v1/skills/<skill_id>/download`, then writes every file
in the response under:

```
~/.claude/skills/<suggested_dir_name>/
```

(override the root with `CLAUDE_SKILLS_DIR` if the user wants it installed somewhere
else). The script prints the final install path on success.

**Always use the response's `suggested_dir_name` as the folder name — never the skill's
`name` field.** Different people can have skills with the same `name` (e.g. everyone
forking the same public template into their own repo); `suggested_dir_name` is an
`<owner>-<name>` slug that keeps those from overwriting each other. The script already
handles this correctly — don't rename the output folder afterward.

After a successful install, tell the user where it landed and that they may need to
start a new Claude Code session for the skill to be picked up, since skills are
typically only loaded at session start.

If the download fails with a 404, the skill either doesn't exist or isn't shared with
this user — don't guess at a fix, just report it. If the skill's SKILL.md references
files outside what got downloaded (e.g. a relative path that isn't in the files list),
say so explicitly rather than silently proceeding — that means the skill's source repo
has a dangling reference and the skill owner needs to fix it upstream, not something
this script can work around.
