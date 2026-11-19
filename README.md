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
- **Tempo:** comes from [ReccoBeats](https://reccobeats.com) when the song is in their database. Spotify no longer provides audio features to new apps. If the tempo is unknown, click the stage in time with the music (3+ taps) to set it. Tapping also lines the beat up with the song.
- **Visualizer:** this is simulated, not real audio. VS Code webviews can't access system audio, so the bars and dancers follow the beat clock instead of an FFT.

## Commands (`Karaoke: …`)

| Command | What it does |
|---|---|
| Search Lyrics Manually | Pick the right LRCLIB entry when the automatic match is wrong. The choice is remembered for that track. |
| Show Lyrics Earlier / Later | Shift lyric timing in 250 ms steps (for this track only). |
| Reload Lyrics | Ignore the cache and look the lyrics up again. |
| Tap Tempo | Same as clicking the stage. |
| Sign in / Sign out of Spotify | |

## Settings

`karaoke.creatureCount` (0–6), `karaoke.showVisualizer`, `karaoke.lyricsOffsetMs` (global offset; positive values show lyrics later).

## Credits

Pixel font: Press Start 2P by CodeMan38 (SIL Open Font License, see `media/fonts/OFL.txt`).
