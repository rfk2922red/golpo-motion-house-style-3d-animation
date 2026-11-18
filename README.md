# Golpo motion house style 3D animation

A Claude skill plus the full source of the first episode ("মায়ের অবসর") for Bangla story-telling animation: flat bean-head cartoon characters in a painted 3D Bangladesh world (Remotion + three.js), Bangla voice-over, synthesized music/SFX and bold colourful captions.

The repository root IS the skill folder (`SKILL.md` is at the top), so it installs as-is.

## Install as a Claude skill
- **claude.ai (any account):** download this repo as a ZIP (Code > Download ZIP), then Settings > Capabilities > Skills > Upload skill and pick the ZIP. If the upload asks for a specific folder name, unzip, rename the folder to `golpo-motion-house-style-3d-animation`, zip it again.
- **Claude Code:** `git clone <this repo> ~/.claude/skills/golpo-motion-house-style-3d-animation` (or unzip into that path). Restart Claude Code.
- Then ask Claude for a new Golpo Motion episode, or say "use the Golpo motion house style".

## What is inside
| Path | What |
|---|---|
| `SKILL.md` | The skill: format, pipeline, Bangladesh world, cast, insert rules, audio, captions, render, QA |
| `references/` | Style guide, look values, episode 1 timing / scene plan / insert round |
| `remotion/` | Episode 1 Remotion source and `SETUP.md` (how to put it into a Remotion project) |
| `audio/` | `synth.py` (music + SFX) and `mix.py` (mix) |
| `episodes/maayer-obosor/` | Sentence timing, caption data, full timeline JSON, SFX cues, working Claude Code prompts |
| `archive/round-backups/` | Per-round source backups |

Not included: voice, music and video files, `public/` assets, `package.json` / `Root.tsx` of the Remotion project. Add a LICENSE before making a public repo.
