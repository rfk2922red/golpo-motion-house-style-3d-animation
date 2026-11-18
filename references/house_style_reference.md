# Golpo Motion house style: reference (from episode 1 "মায়ের অবসর")

Companion to SKILL.md. Built on the cartoon-3D look (flat bean-head cards, plum ink, painted 3D world, three.js in Remotion), adapted to Bangla stories about Bangladeshi middle-class life. Episode 1 facts: 5314 frames, 177.13 s, 1080x1920 at 30 fps, final 1440x2560 (`--scale 1.3333`), 22+ shots, 50 voice sentences, Bangla captions.

## 1. Channel format
- Vertical short for YouTube Shorts, Facebook Reels, Instagram Reels. 2-3 min. One emotional story about money, family, class, effort.
- Bangla voice-over, steady warm tone (edge-tts `bn-BD-PradeepNeural`, rate +0%, was accepted). Original music and SFX, no copyrighted tune. Burned-in Bangla captions (bold, colourful).
- Stories: everyday Bangladeshi struggle with a quiet payoff and a callback in the last shot (ep.1: umbrella on the peg, rain with a solid roof).

## 2. Pipeline (order matters)
1. Story + script (sentences, one per voice line). Write the script in standard Bangla for captions; keep a separate TTS spelling only if the voice needs it (ep.1 used phonetic spellings such as পোড়িস/কোরে for the voice; captions use পড়িস/করে).
2. Voice: generate or record; user approves the final audio file BEFORE anything is timed.
3. Timing: `ffmpeg silencedetect` (about 1 s pause after each sentence) gives sentence start/end; save `sentences.json` (i, start, end, text). Retime `story.ts` shot table to it: every visual reaction lands 0-3 frames before its word.
4. Scene plan and shot table (`SHOTS`, `CAMS`, `DOF`, `KICKS`, `FOREGROUND`, `XFADE`, `FLASH_AT`).
5. World, cast, props in code (Claude Code on the user's PC).
6. Audio: music + SFX synthesized in numpy/scipy on the exact frame count, mixed (section 6). Re-run audio after ANY change of total frames or cue times.
7. Stills review loop (render stills at scale 0.5, send, critique, fix). Repeat until readable.
8. Draft render (scale 0.5) with mix muxed, check sync and loudness.
9. Captions, then final render 1440x2560, crf 16.
10. QA with ffprobe (frames, duration, loudness) and frame sheets.

Deliver each artifact (audio, json, prompt) as soon as it exists, and give Claude Code prompts in one block per round.

## 3. Bangladesh world
- Village: tin-roof (CI sheet) hut, mud plinth, bamboo door/fence, courtyard (uthan), tulsi, jute stalks, banana/coconut/mango/betel palms, pond ghat, paddy, kaccha path at x = 3, banyan bus stop, kupi lamp, pot catching drips. Trees give about 60% green in village wides.
- Pucca house (end of story): plastered cream walls, concrete roof, blue-shuttered windows, peg by the door for the umbrella.
- Town: brick 3-5 storey blocks with roof tanks, wires, rickshaw/CNG/bus, shop signs (no readable text), mess room, bank counter, rooftop with water tank, medical gate. Keep street trees so it never goes grey.
- Interior: hut room (bed, table, shelf, rice tin, kupi), bedroom (wood bed, white sheet, light patterned kantha blanket with folds, bedside lamp, window with blue shutter and rain, tile floor).
- Lights: `day` (humid hazy, warmer), `golden`, `rain` (night/pre-dawn rain with streak cards), `lamp` (hut interior by the kupi). Places: village / interior / town / road. No European props.
- Colour traps seen: lavender walls, purple interiors, black puddles, grass moire, rooftop floor too large, banana leaf blocking a doorway, purple floor in the bedroom, a drip drawn like a candle flame. Check every new set for them.

## 4. Cast (bean heads, 3.5 head-heights, plum ink, billboard cards)
- Roles: mother, nusrat, rahat, mim, father (silhouette only), seller (topi, vest, lungi). Costumes by era (child/teen/adult/old) via `villagerOf(role, era)`.
- Mother: pastel/white cotton saree with a border, pallu over the head, bare wrists after the bangle sale. Eldest daughter: frock -> salwar-kameez blue with yellow dupatta -> bank lanyard. Son: checked shirt -> yellow kurta -> white coat + lanyard (engineer). Youngest: frock with plaits, school uniform with green straps -> white apron.
- Poses: husk, water, sew, write, eat, paper, holdhand, phone, key, stick, rub, read, sleep (lying on a pillow, rotated). Expressions: tearsmile, crying, moved, proud, resolute, tired-smile, silent-tear plus the 14-face library.
- Every character needs motion in every shot (pen strokes, typing, sewing needle, eye rub with an elbow bend and visible sleeve). Blank static faces read as a freeze. Hands need sleeves so arms are attributable.

## 5. Close-up insert rules (lessons from rounds 7-9)
- When the voice names an action (selling bangles, handing money, taking the needle, signing a form) it needs its own insert, not two characters standing. Pattern: two-shot (context) -> hands close-up on an empty background -> reaction two-shot.
- Close-ups: little or no DOF on the key object, object fully in frame, hands complete (not cut by the frame edge), bright enough to read. Dark blurry inserts fail.
- Attach tools to objects (calipers clamp the part; no floating pieces). Props must be recognisable: cloth with a collar line, not lined paper; a long visible thread on the needle.
- No jewellery-like glints on bare wrists.
- Crossfades only at time/place jumps, 8-10 frames. Never leave the outgoing shot at 50% for 20 frames (ghosted double image). Prefer hard cuts.
- Final emotional shot: lying figure on a pillow, soft blanket over the body, lamp glow, camera starts wide and ends no tighter than head-and-shoulders. Tear wipe goes to the outer corner of the eye, never the forehead (reads as a salute).
- No native split screen: use three quick 1.2 s shots in sequence, or composite three clips later.

## 6. Audio recipe
- Synth in numpy/scipy: tanpura drone, bansuri-like lead, pads, Karplus-Strong plucks, final low piano note. Procedural SFX: rain, drip in a pot, dheki thud, needle/thread tug, bus, crowd, bank hum, phone ring, key jingle, notes counted, paper/form, anchal knot, machine hum, metal clink, tear wipe. See `audio/synth.py` and `mix.py`.
- Mix: voice +4 dB, music ducked about 9 dB under voice, SFX ducked about 4 dB, limiter. Target about -15 LUFS integrated, true peak below -1 dBFS, 48 kHz stereo, exact frame length (`DUR = frames/30`).
- Episode 1 cue times (s): drips 28.4/30.1/32.0, bus leaves 82.6, key in palm 141.1, notes counted 72.45, form 73.7, anchal knot money 78.7, three at work 103.69, machine clink about 115.1, needle taken 138.45, tear wipe 173.1.

## 7. Captions spec
- Source: `captions.json` (i, text, start/end frame), standard Bangla spelling, chunks of at most about 30 characters, timed proportionally inside each sentence (+0.25 s tail), no overlap with the next sentence. Example: `episodes/maayer-obosor/data/captions.json`.
- Render as a React overlay above all post passes. Noto Sans Bengali / Hind Siliguri weight 800-900, about 5.6% of frame height, centred at about 72% height, safe side margin 5%, dark plum outline 0.12 em plus soft shadow.
- Colour cycle per word: #FFD23F yellow (first word always), #FF6B6B, #4ECDC4, #FF9F1C, #C77DFF, #7BDFF2; at least 60% light tones. Quoted speech white with yellow quote marks. Pop-in 5 frames, fade-out 3. Never split words/conjuncts; use `delayRender` for the font; `captions` boolean prop.
- Fit script: no chunk over 2 lines; shrink the font to 90% per chunk before cutting words.

## 8. Render environment (the original user's Windows PC; adapt paths for yours)
- Code in `D:\projects\src\videos\maayer\`, Claude Code started with `cd /d D:\projects\ep3pack` then `claude --continue`.
- Remotion defaults fail: set `--timeout 240000`, TEMP/TMP on a big drive (`D:/remotion-tmp`), chunked renders with a few parallel tabs sized to free RAM (about 1.5 GB per tab), big node heap, system Chrome GPU flags that worked for the draft.
- Claude Code reaps idle background shells and stops on low memory: set `CLAUDE_CODE_DISABLE_BG_SHELL_PRESSURE_REAP=1`, run `final_chunks.sh` detached in Git Bash with a log.
- Remotion writes a silent audio track: mux with `-map 0:v:0 -map 1:a:0`, aac. Check free disk (30 GB), delete `remotion-webpack-bundle-*` and `puppeteer_dev_chrome_profile-*` after.
- The chat sandbox has no Remotion/three.js and no network installs: story-level files (story.ts, JSON, audio, prompts) are made there; graphics and renders happen on the PC.

## 9. QA checklist
- ffprobe: resolution, frames, duration equal to the mix, audio stream present.
- ebur128: about -15 LUFS, peak under -1 dBFS.
- Frame sheet at every cue time: readable action, no ghost crossfade, no cropped hands, no blank static faces, captions inside the safe area, Bangla conjuncts intact.
- The user reviews the draft by video time ("1:11, 1:20 ...") and the notes become the next round's prompt (see `episodes/maayer-obosor/prompts/`).

## 10. Episode 1 shot map (final)
22 shots + inserts: 8a bangle sale, 8b form, 9b money handover, 9c crying two-shot, 13b Nusrat, 13c Rahat night job, 13d Mim with mother sewing, 15a Rahat at computer, 15b machine part with calipers, 20a needle taken, 20b key, 22u umbrella, 23 bed scene (frames 5172-5314). Timing table: `episode1_timing.md`; scene plan: `episode1_scene_plan.md`; insert round: `episode1_round7_plan.md`.
