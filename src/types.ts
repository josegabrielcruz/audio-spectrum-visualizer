// Shared types for audio-spectrum-visualizer

export interface Config {
  /** Number of bars rendered in the ring (32–256) */
  barCount: number
  /** Ring radius in 3D units */
  radius: number
  /** Maximum terrain / bar height in 3D units at full amplitude */
  maxHeight: number
  /** AnalyserNode.smoothingTimeConstant — higher = smoother, slower response */
  smoothing: number
  /** Camera auto-rotation speed (0 = static) */
  rotationSpeed: number
  /** 'frequency' = hue maps to frequency bin; 'mono' = single hue */
  colorMode: 'frequency' | 'mono'
  /** HSL hue (0–360) used in mono mode */
  hue: number
  /** Which 3D visualization to show */
  visualMode: 'terrain' | 'lissajous' | 'icosphere' | 'pointcloud'
}

export const DEFAULT_CONFIG: Config = {
  barCount: 128,
  radius: 3.5,
  maxHeight: 3,
  smoothing: 0.8,
  rotationSpeed: 0.4,
  colorMode: 'frequency',
  hue: 195,
  visualMode: 'terrain',
}
