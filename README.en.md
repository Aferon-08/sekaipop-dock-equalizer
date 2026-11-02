# SekaiPOP Dock Equalizer & Living Wallpapers

[![Checks](https://github.com/Aferon-08/sekaipop-dock-equalizer/actions/workflows/checks.yml/badge.svg)](https://github.com/Aferon-08/sekaipop-dock-equalizer/actions/workflows/checks.yml) [![Version](https://img.shields.io/github/v/release/Aferon-08/sekaipop-dock-equalizer)](https://github.com/Aferon-08/sekaipop-dock-equalizer/releases) [![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](LICENSE)

[Русский](README.md) · [Installation](docs/INSTALL.md) · [Releases](https://github.com/Aferon-08/sekaipop-dock-equalizer/releases)

An independent extension for **[SekaiPOP](https://github.com/Blapples/SekaiPop)** on Hyprland: a liquid music dock, word-timed lyrics and procedural glass wallpapers with a tiny firefly companion. **Version 2.23.0 · GPL-3.0.** The settings UI and detailed documentation are currently primarily in Russian.

## 2.23.0 — Configurable dock glass

The **Dock glass** settings group adds a master switch and controls for opacity, refraction, lyric frost/darkening and reactive-light brightness. Switching it off releases window-capture sources and retains your tuned values. There are 61 settings in total. [Settings catalogue](docs/SETTINGS.md).

This branch retains `install.py --repair`. The separate [native API preview](https://github.com/Aferon-08/sekaipop-dock-equalizer/tree/codex/native-extensions) requires a shell patch.

![Music dock demo](docs/media/dock.gif)

![Living wallpaper demo](docs/media/wallpaper.gif)

[Dock video](docs/media/dock.mp4) · [Wallpaper video](docs/media/wallpaper.mp4)

These are recordings of the real QML components in a controlled demo scene, using original sample text and a synthetic spectrum, with no audio. The wallpaper split is triggered early for the short demo. These clips are not performance benchmarks.

![Multiple voices, backing phrase and shared chorus](docs/media/voices.gif)

The multi-voice demo uses explicitly tagged sample data; it demonstrates the UI, not automatic voice-recognition accuracy. [Video](docs/media/voices.mp4).

## Liquid settings panel

**61 settings**, search, smooth scrolling and per-setting / confirmed full reset. The phone morphs through an irregular glass droplet into a taller settings panel, then returns on Back or Escape. [Settings catalogue (RU)](docs/SETTINGS.md).

![Liquid settings panel](docs/media/settings.gif)

The demo uses a sample phone with the real settings component. [Video](docs/media/settings.mp4).

## Features

- Two spring-animated visualizer capsules that merge into the dock; waveform and bars, mirrored left side, system palette.
- Compact and expanded music layouts, cover art, title, playback controls and a wavy progress indicator. Hover restores app icons.
- Animated lyric lines and word progress, a bouncing marker, landing splashes, waiting dots and a separate trailing firefly.
- Multiple lyric regions, synchronized chorus merging, backing phrases and animated per-voice endings.
- Optional local word alignment, JSON import and experimental voice analysis; separate CPU/NVIDIA CUDA runtimes.
- Procedural compositions per monitor sharing one palette, glass and opaque shapes, entrance animation, bar/widget avoidance and restrained ambient motion.
- A wallpaper companion with goals, independent twin journeys, physical tube routes, elastic nearby transitions and bubble travel to otherwise unreachable rooms.

Voice analysis is **experimental**: a dense mix or missing parallel text can prevent reliable voice-specific lyrics. Names are not inferred as identities; unnamed roles receive numbered labels. Basic visuals work without any ML runtime.

## Install

Requires an existing SekaiPOP installation with plugin API 1, Quickshell, Hyprland, Python 3, CAVA and PipeWire-Pulse/PulseAudio. Tested with SekaiPOP `1.0.0`, commit [`69e1df0`](https://github.com/Blapples/SekaiPop/commit/69e1df0f282ca9a5193c1a628b346e5df01c7d93), Quickshell `0.3.2`, Qt `6.12`, Hyprland `0.57`.

```sh
git clone https://github.com/Aferon-08/sekaipop-dock-equalizer.git
cd sekaipop-dock-equalizer
python3 install.py
```

The installer backs up and patches five shell files, then restarts SekaiPOP. This is a **local shell adapter**, not a drop-in desktop widget: the shell's plugin manager alone cannot install the dock and wallpaper integrations.

**A normal install/reinstall clears saved recordings, word timings and listening markers, and renews the wallpaper installation seed.** To update or repair after a SekaiPOP upgrade while keeping your data:

```sh
git pull --ff-only
python3 install.py --repair
```

To uninstall, run `python3 install.py --uninstall` from this checkout. Full dependency, model, backup and removal instructions: [INSTALL.md](docs/INSTALL.md).

## Use and data

Open **SekaiPOP Settings → Desktop → Plugins → Dock Equalizer**. Start an MPRIS-compatible player. On an empty desktop, the horizontal dock expands; click the cover to open word-timing settings. Prepare the optional engine before requesting generation with the small glass-area button or the regenerate action.

Heavy analysis is **manual**. Spotify capture is **enabled by default** and separately saves the Spotify playback stream locally from the beginning of a track, even before analysis is requested. A complete pass is required. Disable it in plugin settings if unwanted; raw audio takes roughly **10 MB per minute**. The microphone is not used. Model setup and online lyric/YouTube sources may use the network; audio inference runs locally. See [PRIVACY.md](docs/PRIVACY.md).

CUDA is for audio analysis and does not automatically move the shell renderer to the discrete GPU. The installer checks known source anchors and stops if the shell layout is incompatible. Future SekaiPOP revisions may need a new adapter.

## Develop

```sh
python3 build-pet-worker.py --check
node tests/tube-and-family.mjs
node tests/bubble-family.mjs
```

See [DEVELOPMENT.md](docs/DEVELOPMENT.md) for rendering demos and compiling the shipped shader sources, [CONTRIBUTING.md](CONTRIBUTING.md) for contributions, and [THIRD_PARTY.md](THIRD_PARTY.md) for upstream projects. Licensed under [GPL-3.0](LICENSE).
