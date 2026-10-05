# درع الوطن — motion graphic (1:07)

Motivational military motion graphic, 1920×1080 @ 30 fps, 67 s, drawn on an HTML canvas.

**Final videos** (`out/`):
- `saudi_forces_motion_drums_sfx.mp4` — sound effects + military percussion (no melody, no vocals)
- `saudi_forces_motion_sfx_only.mp4` — sound effects only, no music at all
- `saudi_forces_motion_silent.mp4` — no audio track (for adding your own soundtrack)

**Rebuild**
```sh
python3 audio/build_audio.py                    # audio stems + mixes (needs numpy, scipy)
node tools/render.cjs --workers 3 --out out/video_master.mp4 --audio audio/mix_full.wav --muxed out/video_with_audio.mp4
node tools/preview.cjs --range 12:24:1 --sheet --out preview/s3   # stills + contact sheet
```
Open `index.html?play` through any static server to watch it live in a browser.

`BRIEF.md` holds the timeline and audio cue sheet, `ASSETS.md` documents the shared drawing library.
