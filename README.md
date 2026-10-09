# MockPulse AI

Hyper-realistic, AI-powered remote technical interviewer — a desktop app where a
lip-synced 3D avatar interviews you live, you answer with your mic, solve tasks in a
real code editor, and get a scored report at the end.

**Website:** [mockpulse-web.vercel.app](https://mockpulse-web.vercel.app)
· **Site source:** [mockpulse-web](https://github.com/Bolu-Tife-dev/mockpulse-web)
· **Releases:** [Latest release](https://github.com/Bolu-Tife-dev/mockpulse-ai-app/releases/latest)

## Download

Grab an installer from the [latest release](https://github.com/Bolu-Tife-dev/mockpulse-ai-app/releases/latest),
or jump straight to your platform:

| Platform | Installer |
| --- | --- |
| Windows | [MockPulse-Setup.exe](https://github.com/Bolu-Tife-dev/mockpulse-ai-app/releases/latest/download/MockPulse-Setup.exe) (NSIS) · [MockPulse-Portable.exe](https://github.com/Bolu-Tife-dev/mockpulse-ai-app/releases/latest/download/MockPulse-Portable.exe) |
| macOS | [MockPulse-Setup.dmg](https://github.com/Bolu-Tife-dev/mockpulse-ai-app/releases/latest/download/MockPulse-Setup.dmg) |
| Linux | [MockPulse-Setup.AppImage](https://github.com/Bolu-Tife-dev/mockpulse-ai-app/releases/latest/download/MockPulse-Setup.AppImage) |

Installs are unsigned, so on Windows click "More info → Run anyway" on the SmartScreen
prompt, and on macOS right-click → Open the first time you launch it.

## Features

- **Live interview with an AI avatar** — Three.js talking head with audio-driven lip sync
- **Meeting-style grid** — interviewer tile, your webcam tile, screen share, chat, whiteboard
- **Real coding workspace** — Monaco editor (the VS Code engine) inside the interview
- **LLM interview flow** — role/tailored questions and follow-ups from Gemini or Groq
- **Speech in and out** — Whisper streaming transcription + TTS voice for the avatar,
  with half-duplex mic handling (pauses while the interviewer speaks)
- **Scorecard** — strengths, gaps, per-skill scores, export to Markdown or PDF
- **Your keys stay local** — API keys are stored with the OS keychain (keytar) and never
  leave your machine; calls go directly to your chosen provider

## Development

```bash
npm install
npm run dev        # Vite + Electron with hot reload
npm run build      # typecheck + production renderer bundle
npm run dist:win   # package a Windows installer into release/
npm run dist:mac    # macOS dmg
npm run dist:linux # AppImage / deb / tar.gz
npm run icons      # regenerate build/icon.png
```

The renderer is a Vite + React + TypeScript app; the shell is plain Electron
(`electron/main.js`, `electron/preload.js`). API keys, models, voice and avatar
settings are managed in the in-app Settings dialog (Alt+S).

## Releases

Pushing a tag like `v1.0.0` triggers
[`.github/workflows/build-release.yml`](.github/workflows/build-release.yml),
which builds on Windows, macOS and Linux and attaches the installers to a GitHub
Release.

## License

[MIT](LICENSE)
