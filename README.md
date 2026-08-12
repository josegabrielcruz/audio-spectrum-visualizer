# Audio Spectrum Visualizer

A real-time 3D audio visualizer that maps microphone input or audio file playback to four distinct visual modes rendered with React Three Fiber. Switch between a scrolling spectrogram terrain, a Lissajous 3D curve, a morphing icosphere, and a particle cloud — all driven live by the audio signal.

![screenshot placeholder](./screenshot.png)

## Features

- **Four visualization modes** switchable in real time
- **Live audio sources** — microphone capture or drag-and-drop audio file (loops)
- **Animated demo mode** — synthetic audio patterns animate each visualization when no source is connected
- **Colour modes** — *Spectrum* (hue maps to frequency bin) or *Mono* (single configurable hue)
- **Smooth analogue response** — adjustable AnalyserNode smoothing constant

## Visualizations

| Mode | Description |
|---|---|
| **Terrain** | A 64×70 grid scrolling into the distance. Frequency data writes new rows at the front; older rows fade toward the horizon, producing a real-time spectrogram landscape. |
| **Lissajous** | 1,024-point 3D line: X = audio sample[i], Y = sample[i + ¼ period]. The quarter-period phase shift between channels creates figure-eight and knot shapes that morph with the signal. |
| **Sphere** | 960-vertex icosphere where each vertex is displaced outward by its corresponding frequency amplitude. Poles respond to bass; the equator to treble. Slow Y-axis rotation reveals the full 3D shape. |
| **Cloud** | 5,000 particles distributed on a Fibonacci sphere. Each particle is pushed outward along its home direction by its frequency band. Additive blending creates natural bloom where particles cluster — denser regions appear brighter without post-processing. |

## Tech

| Layer | Choice |
|---|---|
| Build | Vite + React + TypeScript |
| 3D rendering | React Three Fiber (`@react-three/fiber`) + Three.js |
| Helpers | `@react-three/drei` (OrbitControls) |
| Audio | Web Audio API — `AnalyserNode` |

## Getting Started

```bash
cd audio-spectrum-visualizer
npm install
npm run dev -- --host 127.0.0.1
```

Open `http://127.0.0.1:5173` (or whichever port Vite reports).

Grant microphone permission when prompted, or click **📁 File** to load an audio file.

## Controls

### Source
| Control | Effect |
|---|---|
| **🎤 Mic** | Request microphone access and begin live capture |
| **📁 File** | Load an audio file; it plays on loop through the analyser |
| **Stop** | Disconnect the current source and return to demo mode |

### View
| Mode | Switch via |
|---|---|
| Terrain / Lissajous / Sphere / Cloud | View toggle buttons |

### Parameters
| Control | Effect |
|---|---|
| **Max Height** | Vertical amplitude scaling (applies to all modes) |
| **Smoothing** | AnalyserNode `smoothingTimeConstant` — higher = slower response |
| **Rotation** | Camera auto-rotation speed (0 = static; Terrain always static) |
| **Color Mode** | *Spectrum* (freq → hue) or *Mono* (single hue) |
| **Hue** | 0–360 hue used in Mono mode |

## Project Structure

```
src/
├── types.ts                     Config interface + defaults
├── App.tsx                      State, hook wiring, layout
├── hooks/
│   └── useAudioAnalyser.ts      AudioContext + AnalyserNode lifecycle
└── components/
    ├── Scene/
    │   ├── index.tsx            Canvas + camera per mode
    │   ├── SpectrogramTerrain   Scrolling 3D terrain mesh
    │   ├── LissajousLine        Phase-shifted waveform line
    │   ├── MorphingIcosphere    Frequency-displaced icosphere
    │   └── FrequencyPointCloud  Fibonacci-sphere particle cloud
    └── Controls/                Source toggles + parameter sliders
```
