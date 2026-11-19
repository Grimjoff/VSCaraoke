# Karaoke

A VS Code panel that shows time-synced lyrics for whatever is playing on Spotify. A small pixel stage at the bottom has a beat-driven visualizer and dancing "sproutlings".

## Setup

1. Go to <https://developer.spotify.com/dashboard> and create an app.
   - Redirect URI: `http://127.0.0.1:43821/callback`
   - API: Web API
2. Copy the app's **Client ID** into the `karaoke.spotifyClientId` setting.
3. Open the **Karaoke** panel (next to Terminal / Output) and click **Sign in to Spotify**.

## How it works

- **Now playing:** the extension polls Spotify's `currently-playing` endpoint, every second while music plays. It only polls while the panel is visible. The webview interpolates playback position between polls, so the highlighting stays smooth.
- **Lyrics:** the extension looks lyrics up on [LRCLIB](https://lrclib.net) in this order:
  1. Exact match.
  2. Normalized title (drops "Remastered", "feat.", "Live" and similar) and first artist only.
  3. Search, choosing the result closest in duration.
  4. Unsynced plain lyrics.

  Results are cached per track.
- **Tempo:** comes from [ReccoBeats](https://reccobeats.com) when the song is in their database. Spotify no longer provides audio features to new apps. If the tempo is unknown, click the BPM label in the header in time with the music (3+ taps) to set it. Tapping also lines the beat up with the song.
- **Visualizer:** this is simulated, not real audio. VS Code webviews can't access system audio, so the bars and dancers follow the beat clock instead of an FFT.

## Commands (`Karaoke: …`)

| Command | What it does |
|---|---|
| Search Lyrics Manually | Pick the right LRCLIB entry when the automatic match is wrong. The choice is remembered for that track. |
| Show Lyrics Earlier / Later | Shift lyric timing in 250 ms steps (for this track only). |
| Reload Lyrics | Ignore the cache and look the lyrics up again. |
| Tap Tempo | Same as clicking the BPM label. |
| Sign in / Sign out of Spotify | |

## Settings

| Setting | Default | What it does |
|---|---|---|
| `karaoke.chaos` | `lively` | How messy the stage gets: `calm`, `lively` or `chaos`. |
| `karaoke.creatureCount` | 6 | How many dancers (0–12). |
| `karaoke.species` | all | Which creatures can appear: `sproutling`, `capling`, `wisp`, `beepbox`, `dribble`. |
| `karaoke.stageHeight` | 112 | Height of the stage in pixels. |
| `karaoke.showVisualizer` | on | Bars behind the dancers. |
| `karaoke.lyricsOffsetMs` | 0 | Global lyric offset. Positive values show lyrics later. |

## The stage

- **sproutling:** round blob with a leaf.
- **capling:** little mushroom.
- **wisp:** floating ghost with a wiggly tail.
- **beepbox:** robot with a screen face and a blinking antenna.
- **dribble:** slime drop.
- **skitter:** bug that runs around on its own. You don't pick these; the chaos level decides how many there are.

Click the stage to give every creature a new random color. A new song switches back to colors taken from the album art.

Every bar, each dancer picks a new move. Moves include bob, hop, sway, wave, cheer, spin, stomp and headbang. Wisps do loops instead of hopping. On higher chaos levels dancers also leap across the stage or trip and lie dazed for a few beats. Extras: music notes, hearts, dust puffs, confetti every 8 bars, and screen shake on `chaos`.

Sprites are text grids in [src/webview/sprites.ts](src/webview/sprites.ts), one digit per palette slot (outline, body, highlight, shade, eye, accent and so on). To make a new creature, copy one of them and redraw it.

### Preview without Spotify

Run `npm run compile`, then open [dev/preview.html](dev/preview.html) in a browser. It plays a fake song and has controls for BPM, chaos level, number of creatures and colors. You can also pass settings in the URL, for example `preview.html?chaos=chaos&count=10&bpm=150`.

## Credits

Pixel font: Press Start 2P by CodeMan38 (SIL Open Font License, see `media/fonts/OFL.txt`).
