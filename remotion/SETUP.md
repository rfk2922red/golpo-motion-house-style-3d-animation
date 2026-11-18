# Using the Remotion source

This folder holds only the video source (`src/videos/maayer/`). Put it into a Remotion project that has these packages: `remotion`, `@remotion/three`, `@remotion/google-fonts`, `three`, `@react-three/fiber`, `@react-three/postprocessing`, `postprocessing`, `react`.

1. Copy `src/videos/maayer/` to `<your-remotion-project>/src/videos/maayer/`.
2. Register the composition in `src/Root.tsx`:

```tsx
import { MaayerShort, MAAYER_FRAMES } from "./videos/maayer/Bridge";
// inside <>...</>
<Composition id="MaayerShort" component={MaayerShort} durationInFrames={MAAYER_FRAMES} fps={30} width={1080} height={1920} />
```

3. Assets (not stored in git, see .gitignore): `public/maayer/mix_v2.wav` (the audio mix; made with `audio/synth.py` + `audio/mix.py` from the voice) and `public/maayer/sentences.json` (copy from `episodes/maayer-obosor/data/`). Optional CC0 Kenney props go in `public/bridge/kenney/*.glb`; the Bangladesh set is built in code and does not need them.
4. Render (final, 1440x2560), with TEMP on a big drive and enough RAM for the parallel tabs:

```
npx remotion render src/index.ts MaayerShort out/maayer/final.mp4 --codec h264 --crf 16 --scale 1.3333 --timeout 240000
```

Then mux the mix: `ffmpeg -i final.mp4 -i mix_v2.wav -map 0:v:0 -map 1:a:0 -c:v copy -c:a aac -b:a 256k final_audio.mp4`.

Captions: `Captions.tsx` reads `captions.json` and is on by default. For a clean version without captions add `--props='{"captions":false}'` to the render command.

`src/videos/maayer/*.rNbak` backups from rounds 6-9 live in `archive/round-backups/`.
