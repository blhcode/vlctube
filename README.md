# VLCTube

A YouTube-style client for **desktop (Linux)** and **Android**. Browse Home, Shorts, search, and channels with a familiar layout. Playback uses [yt-dlp](https://github.com/yt-dlp/yt-dlp) (the same kind of extractor VLC uses for YouTube), so the YouTube website player — and its ads — never load.

## Features

- YouTube-like guide, Home, Shorts, search, channels, and watch UI
- Ad-free playback via yt-dlp stream extraction
- Local history, Watch later, Liked, and Subscriptions (on-device only)
- No Google login required

## Desktop (Linux)

### From source

```bash
npm install
npm start
```

### Build a `.deb`

```bash
npm run dist
# → dist/vlctube_<version>_amd64.deb
sudo apt install ./dist/vlctube_*.deb
```

Then open **VLCTube** from the app menu, or run `vlctube`.

## Android

Requires **JDK 21+** (Capacitor 8).

```bash
npm install
npx cap sync android
cd android && ./gradlew assembleDebug
# → android/app/build/outputs/apk/debug/app-debug.apk
```

Install with:

```bash
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```

## Notes

- Streams currently play as muxed 360p MP4 (Android yt-dlp client) — seekable and without ads.
- History / lists are stored locally on the device only.

## License

MIT
