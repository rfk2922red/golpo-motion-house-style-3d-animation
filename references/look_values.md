# Look values (cartoon-3D short style, inherited and kept)

Use these when the original `cartoon-3d-short` skill is not installed. The look lives in these values; story lives in `story.ts`, set layout in `build.ts`, roles in `cast.ts`.

## Stack
Remotion + three.js (@react-three/fiber, postprocessing). Files per video: `story.ts` (shots/cameras), `lights.ts` (light presets), `shade.ts` (two-tone shading), `build.ts` (world), `paint.ts` (Canvas2D painted textures), `world.ts` (sky, fog, posing), `toon.ts` (Pen drawing API, 600x1000 design canvas, soles at y = 975), `cast.ts` (billboards, effect cards, blinks, walk cycles), `cardshade.ts`, `ink.ts`, `lensblur.ts`, `grade.ts`, composition wrapper. Composer order: ink -> lens pre -> lens main -> bloom -> NEUTRAL tone map -> grade (MSAA 4). Pixel parameters scale with output height / 1920.

## Light presets
- day: sun az 75 / el 48, lit [1.58,1.5,1.33], shade [.30,.29,.36], lift [.05,.06,.11] (cool tint only in shade), sky top #3e7fd2 -> horizon #b8d0ec, fog = horizon, 25 -> 300 m. For Bangladesh make it slightly hazier and warmer.
- golden: az 6 / el 7 (backlit low sun), key toward #FFB36B x1.5, violet-blue shade, sky #ffc47c -> #8a6f8a, peach fog past 50 m, sun disc #ffcf9e + bloom.
- rain: day palette dropped about 25% in luma, sky #7f8fa3 -> #b9c4cf, fog from 15 m, rain streak cards (about 4 px at 1080).
- lamp: hut interior by the kupi, warm emissive card, flicker.

## Ink
#030303, 5.1 px near (6 m) -> 3.3 px far (90 m) at 1080x1920. Creases x0.8 from 35 degrees, depth jumps from 1%. Character cards on layer NOINK (they carry their own plum ink #241726). Ink must be its own pass before the blur.

## Lens (cInf px at 1080)
Hook/close-ups 12-16, medium shots 10-12, golden sway 5, wides/aerials 0. Focus on the eyes. DOF on about one third of screen time. Close-up inserts of objects: little or no blur.

## Characters
Bean head h/w .94, eyes .26 W apart, no blush, no eye highlights, adults 3.5 head-heights, legs 1.4 HH, stick limbs, ink-dot hands, walk bob 3-7%, lean 1-7 degrees, planted feet, blinks every 0.5-2.3 s lasting 4 frames, tight contact shadow.

## Camera
Hard cuts on big jumps; otherwise smootherstep glides of 18-40 frames. Every hold creeps in 0.15-0.35 %/f (0.6 %/f on punch words); no static hold of 4 frames or more. Rolls of 4-5 degrees. Impact kicks flip sign each frame and decay over 7 frames. Foreground props in about one third of shots (they must be recognisable). A white 4-frame flash after the hook line.

## Gotchas
- Disk: every Remotion bundle copies `public/` into the temp folder and is never deleted; render with TEMP/TMP on a big drive and clean `remotion-webpack-bundle-*` afterwards.
- In JS strings write `"D:/remotion-tmp"`, never a backslash path (`\r` becomes a carriage return).
- Remotion writes a silent audio track: mux with `-map 0:v:0 -map 1:a:0`.
- Props closer than about 2 m to the lens become huge cut-off blobs; a foreground bush cut by the frame edge reads as a green ball.
- Cameras end up inside houses: keep a sight-line culler.
- Film grain off (it quadruples file size).
- Scratch .ts files inside `out/` break `tsc`; name them .txt.
- Kenney CC0 kit materials are teal: recolour by material name.
