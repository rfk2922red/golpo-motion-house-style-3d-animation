Round 10: add bold, colourful Bangla captions, then the FINAL render. Keep everything else exactly as in draft_r9.

FILES
- D:\projects\maayer_round10\captions.json (91 chunks: i, text, startFrame, endFrame at 30 fps; correct standard Bangla spelling, already timed to the voice). Copy it to src/videos/maayer/captions.json and import it. Do NOT use the sentence text from maayer.json (it has phonetic TTS spellings like পোড়িস / কোরে).
- Composition stays 5314 frames, 1080x1920, audio mix_v2.wav.

CAPTION COMPONENT (new Captions.tsx, rendered as a plain React/HTML overlay ABOVE the three.js canvas and ALL post passes, so ink/blur/grade never touch it)
- Show the chunk whose [startFrame, endFrame) contains the frame. Hold nothing between chunks except the natural gap.
- Font: Noto Sans Bengali (or Hind Siliguri) weight 800/900, loaded with @remotion/google-fonts and a waitUntilDone/delayRender so the glyphs are ready before any frame is captured. Never split a word or a conjunct (use word boundaries by spaces only). Verify conjuncts (ক্ষ, স্ত, শ্চি, ঁ, ্য) render correctly in a still.
- Size: about 5.6 percent of frame height (about 108 px at 1080x1920), line height 1.25, max 2 lines, centred, max width 88 percent of frame. All sizes in % / vh-style units so the 1.3333 scale render looks identical.
- Position: lower third, centre of the text block at about 72 percent of frame height (above the Reels/Shorts UI zone, which covers the bottom 20 percent). Keep inside the 5 percent side safe margins.
- Look: thick dark-plum outline (#1b0f1f, paint-order stroke, about 0.12 em) plus a soft drop shadow so it reads on every background (bright sky, dark night rooms). No box behind the text.
- Colour: bold and colourful. Cycle word colours through this palette, starting at a different offset for every chunk so it feels lively: #FFD23F (yellow), #FF6B6B (coral), #4ECDC4 (teal), #FF9F1C (orange), #C77DFF (violet), #7BDFF2 (sky). Keep at least 60 percent of the words in the lighter tones (yellow, sky, teal) for readability. The first word of a chunk is always yellow. Quoted speech (inside “ ”) uses white words with a yellow quote marks.
- Motion: each chunk pops in over 5 frames (scale 0.85 to 1.0 with a small overshoot, opacity 0 to 1) and fades out over the last 3 frames. No per-letter animation.
- Add a boolean input prop `captions` (default true) so a clean version can be rendered later.
- Fit check: write a small script that measures every chunk (use the same font at the final size) and fails if any chunk needs more than 2 lines or overflows the safe width. Fix by lowering the font size for that chunk only (down to 90 percent), never by cutting words.

STILLS CHECK (quick, before the long render; do not stop to wait for me)
- Typecheck, then render scale 0.5 stills with captions at frames: 40, 230, 500, 1700, 2400, 3150, 3700, 4900, 5100, 5200 into out/maayer/stills_cap/. Look at them yourself: text readable on bright and dark scenes, nothing cut off, colours look right, no tofu boxes or broken Bangla conjuncts. If something is wrong, fix and re-render those stills. Then go on.

FINAL RENDER (use as much of this PC as is needed; I have closed every other window and will not use the PC)
- Scale 1.3333 (1440x2560), h264, crf 16, 30 fps, pixel format yuv420p.
- Memory and CPU: do not use the low-memory settings from before. Check free RAM and logical cores (wmic / Get-CimInstance) and set --concurrency to the largest value that fits: about 1 tab per 1.5 GB of free RAM, at most the number of logical cores, at least 2. Give node a big heap (set NODE_OPTIONS=--max-old-space-size=8192 or higher if more than 16 GB is free). Keep --timeout 240000 (ms), the system Chrome GPU settings that worked for the draft, and render in a few large chunks (for example 4 chunks of about 1330 frames) so that a crash costs little. If a chunk fails with out of memory, retry only that chunk with concurrency reduced by 1.
- TEMP and TMP on D:/remotion-tmp. Check free disk first (need at least 30 GB), else say so and stop.
- Run the render as a detached background script (final_chunks.sh in Git Bash, nohup) with a log file, so it does not depend on this chat staying active; set CLAUDE_CODE_DISABLE_BG_SHELL_PRESSURE_REAP=1. Poll the log every few minutes with a short status line; do not stop because the session looks idle.
- Concatenate the chunks without re-encoding, then mux mix_v2.wav with -map 0:v:0 -map 1:a:0, aac 256k, -movflags +faststart. Output: out/maayer/final_r10_captions.mp4.
- Verify with ffprobe: 1440x2560, 5314 frames, 177.13 s, audio present, loudness about -15 LUFS and peak under -1 dBFS (ebur128). Pull 8 frames across the video (including 2 with long captions) into out/maayer/qa_final/ and look at them.
- Clean up: delete the remotion-webpack-bundle-* and puppeteer_dev_chrome_profile-* folders in D:/remotion-tmp and the chunk files after the final file is verified.
- When done, print the file path, size and the ffprobe summary. That is the end of this task.
