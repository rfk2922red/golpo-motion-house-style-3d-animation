---
name: golpo-motion-house-style-3d-animation
description: Make Golpo Motion Bangla story shorts (2-3 min): flat bean-head cartoon cards in a painted 3D Bangladesh world, Remotion + three.js, Bangla voice, synth music/SFX, bold captions. Use for new episodes or fixes in this style.
---

# Golpo Motion house style 3D animation

House style for the Bangla story-telling animation channel (YouTube, Facebook, Instagram). Flat bean-head cartoon cards with plum ink outlines stand in a painted 3D world with black ink lines (three.js inside Remotion), telling stories about the money and middle-class struggles of Bangladeshi families. Proven on episode 1, "মায়ের অবসর" (177 s, 5314 frames, 22+ shots).

## Bundle map (read what you need; paths are relative to this skill folder)
- `references/house_style_reference.md`: full detail on pipeline, world, cast, insert rules, audio, captions, render environment, QA. Read it before planning an episode.
- `references/look_values.md`: ink, light presets, lens, camera, character and gotcha values (use when the original cartoon-3d-short skill is not installed).
- `references/episode1_timing.md`, `episode1_scene_plan.md`, `episode1_round7_plan.md`: the finished episode as a worked example.
- `episodes/maayer-obosor/prompts/`: the Claude Code prompts that worked (insert scenes, captions + final render).
- `episodes/maayer-obosor/data/`: `sentences.json`, `captions.json`, `maayer.json` (full timeline data), SFX cue list, TTS script.
- `audio/synth.py`, `audio/mix.py`: the music/SFX synth and the mix.
- `remotion/src/videos/maayer/`: the full Remotion + three.js source of episode 1 (`story.ts` shot table, `lights.ts`, `build.ts` world, `cast.ts`, `toon.ts`, `inserts.ts`, `Captions.tsx`, post passes). Copy it into a Remotion project as the starting point of a new episode (see `remotion/SETUP.md`).
- `archive/round-backups/`: per-round source backups; ignore unless asked.

## Format
- Vertical 1080x1920, 30 fps, 2-3 min. Final export 1440x2560 (`--scale 1.3333`, h264, crf 16).
- Bangla voice-over, one steady warm tone (edge-tts `bn-BD-PradeepNeural`, rate +0%, worked). Original music and SFX only.
- Burned-in bold, colourful Bangla captions (most viewers watch muted).
- Story shape: hook line, setting, escalation in small human moments, payoff, and a callback in the last shot (ep.1: the umbrella on the peg and the rain on a solid roof).

## Pipeline (in this order)
1. Script in standard Bangla, one sentence per voice line. Keep caption spelling separate from any phonetic TTS spelling.
2. Voice. The user approves the final audio file BEFORE any timing work.
3. Sentence timing: `ffmpeg silencedetect` (about 1 s pause after each sentence) -> `sentences.json` (i, start, end, text).
4. Retime `story.ts` to the sentences. Every visual reaction lands 0-3 frames before its word. When shots are inserted, renumber and update every id-based reference (cast switch, CAMS, DOF, FOREGROUND).
5. Shot table: `SHOTS`, `CAMS`, `DOF`, `KICKS`, `FOREGROUND`, `XFADE`, `FLASH_AT`; light presets `day/golden/rain/lamp`; places `village/interior/town/road`.
6. Graphics are code changes in a Remotion + three.js project (done by Claude Code on the user's computer). Write the Claude Code prompt as one block per round and tell the user where to paste it.
7. Audio (numpy/scipy synth, ffmpeg) on the exact frame count. Re-run after ANY change of total frames or cue times.
8. Stills loop: render stills at scale 0.5, the user sends them, critique each against the voice line, fix, repeat.
9. Draft render (scale 0.5) with the mix muxed; check frames, duration, loudness and sync (ffprobe, ebur128, a contact sheet at every cue time).
10. Captions, then the final render.

## Bangladesh world
- Village: CI-sheet tin-roof hut, mud plinth, bamboo door/fence, courtyard, tulsi, jute stalks, banana/coconut/mango/betel palms, pond ghat, paddy, kaccha path, banyan bus stop, kupi lamp, steel pot under a leak. Village wides are about 60% green.
- End-of-story pucca house: cream plaster, concrete roof, blue shutters, a peg by the door.
- Town: brick 3-5 storey blocks with roof tanks and wires, rickshaw/CNG/bus, shop signs without readable text, mess room, bank counter, rooftop water tank, medical gate, street trees.
- Lights: `day` humid hazy and warm, `golden`, `rain` (streak cards), `lamp` (hut interior). No European props.
- Known traps: lavender walls and purple interiors, black puddles, grass moire, oversized rooftop floor, leaves blocking a doorway, a drip drawn like a candle flame.

## Cast and acting
- Bean heads, 3.5 head-heights, plum ink, billboard cards. Roles with era costumes (child/teen/adult/old): mother (cotton saree with border, pallu on the head, bare wrists after selling bangles), eldest daughter, son, youngest daughter, father as a silhouette, plus one-off roles (seller).
- Poses: husk, water, sew, write, eat, paper, holdhand, phone, key, stick, rub, read, sleep. Expressions: the 14-face library plus tearsmile, crying, moved, proud, resolute, tired-smile, silent-tear.
- Every character moves in every shot (pen strokes, typing, sewing, eye rub with an elbow bend). A blank static face reads as a freeze. Arms need visible sleeves.

## Close-up insert rules
- When the voice names an action (sells bangles, hands over money, takes a needle, signs a form) give it its own insert: two-shot for context, then hands on an empty background, then a reaction two-shot.
- Inserts are bright, sharp on the key object (little or no DOF), objects and hands fully in frame.
- Attach tools to objects (calipers clamp the part). Props must be recognisable (cloth with a collar line, not lined paper; needle with a long visible thread). No glints on bare wrists.
- Crossfades only at time or place jumps, 8-10 frames, never leaving the outgoing shot at 50% for many frames. Prefer hard cuts.
- Closing shot: figure lying on a pillow with a soft blanket and lamp glow; camera ends no tighter than head-and-shoulders; tear wipe goes to the outer corner of the eye (a fist at the forehead reads as a salute).
- No native split screen: use quick successive shots of about 1.2 s, or composite clips later.

## Audio recipe
- Synth in numpy/scipy: tanpura drone, bansuri-like lead, pads, Karplus-Strong plucks, a low final piano note; procedural SFX (rain, drips in a pot, dheki, needle and thread, bus, crowd, bank hum, phone, key jingle, paper, machine hum, metal clink). See `audio/`.
- Mix: voice +4 dB, music ducked about 9 dB under the voice, SFX ducked about 4 dB, limiter. Target about -15 LUFS and peak below -1 dBFS, 48 kHz stereo, exact length (`DUR = frames/30`).

## Captions
- `captions.json` (standard Bangla text, start/end frame), chunks of at most about 30 characters, timed proportionally inside each sentence with a 0.25 s tail and no overlap. Example in `episodes/maayer-obosor/data/`.
- React overlay above all post passes. Noto Sans Bengali or Hind Siliguri weight 800-900, about 5.6% of frame height, centred at about 72% height, 5% side margins, plum outline about 0.12 em plus soft shadow, no box.
- Word colours cycle #FFD23F (first word always), #FF6B6B, #4ECDC4, #FF9F1C, #C77DFF, #7BDFF2, at least 60% light tones. Quoted speech white. Pop-in 5 frames, fade-out 3. Never split words or conjuncts. Load the font with `delayRender`. Provide a `captions` boolean prop. Run a fit check (max 2 lines).

## Render environment
- Remotion needs `--timeout 240000`, TEMP/TMP on a big drive, chunked renders with parallel tabs sized to free RAM (about 1.5 GB per tab) and a big node heap. When the user closes other apps, use as much RAM as fits.
- Claude Code may reap idle background shells: set `CLAUDE_CODE_DISABLE_BG_SHELL_PRESSURE_REAP=1` and run the chunk script detached with a log.
- Remotion writes a silent audio track: mux with `-map 0:v:0 -map 1:a:0`, aac. Check at least 30 GB free disk, then delete `remotion-webpack-bundle-*` and `puppeteer_dev_chrome_profile-*`.
- The chat sandbox usually has no Remotion, three.js or network installs. Make story-level files, JSON, audio and prompts there; graphics and renders happen on the user's computer.

## QA before delivering
- ffprobe: resolution, frame count, duration equal to the mix, audio present. ebur128: about -15 LUFS, peak below -1 dBFS.
- Contact sheet at every cue time: action readable, no ghosted crossfade, no cropped hands, no blank faces, captions inside the safe area, Bangla conjuncts intact.
- The user reviews by video time ("1:11, 1:20 ..."); turn those notes into the next round's prompt.

## Working style
- Reply in Bangla when the user writes in Bangla. Keep replies short and lead with the answer.
- Deliver each artifact (audio, JSON, prompt) as soon as it exists.
