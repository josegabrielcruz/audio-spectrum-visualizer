import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import type { Config } from '../../types'

// ── Grid constants ────────────────────────────────────────────────────────
// COLS = frequency bins across width  (X axis)
// ROWS = history depth into distance  (Z axis)
// Row 0 = newest data (closest to camera), Row ROWS-1 = oldest (far horizon)
const COLS = 64    // frequency resolution
const ROWS = 70    // time history depth
const W    = 12    // world-space width
const D    = 14    // world-space depth

// ── Static triangle index buffer (built once at module load) ──────────────
const INDICES = (() => {
  const idx = new Uint32Array((COLS - 1) * (ROWS - 1) * 6)
  let k = 0
  for (let row = 0; row < ROWS - 1; row++) {
    for (let col = 0; col < COLS - 1; col++) {
      const a = row * COLS + col
      const b = a + 1
      const c = a + COLS
      const d = c + 1
      // Winding order produces normals pointing up (+Y) — correct for FrontSide
      idx[k++] = a;  idx[k++] = c;  idx[k++] = b
      idx[k++] = b;  idx[k++] = c;  idx[k++] = d
    }
  }
  return idx
})()

// ── Colour LUT: amplitude 0→1 maps dark-blue → cyan → white ──────────────
// Pre-computed once, used for every vertex every frame via simple array lookup.
const LUT = (() => {
  const lut = new Float32Array(256 * 3)
  const c   = new THREE.Color()
  for (let i = 0; i < 256; i++) {
    const a = i / 255
    // HSL: hue shifts from blue (0.58) to warm-yellow (0.15) at peak amplitude
    c.setHSL(0.58 - a * 0.43, 1.0, 0.04 + a * 0.86)
    lut[i * 3] = c.r;  lut[i * 3 + 1] = c.g;  lut[i * 3 + 2] = c.b
  }
  return lut
})()

// ── Persistent history buffer (survives React StrictMode remounts) ────────
// Circular: histHead points to the slot for the NEXT write
const _hist = new Float32Array(ROWS * COLS)

// ── Component ─────────────────────────────────────────────────────────────

export interface TerrainProps {
  analyserRef: React.MutableRefObject<AnalyserNode | null>
  frequencyDataRef: React.MutableRefObject<Uint8Array<ArrayBuffer>>
  configRef: React.MutableRefObject<Config>
}

export function SpectrogramTerrain({ analyserRef, frequencyDataRef, configRef }: TerrainProps) {
  const headRef     = useRef(0)    // circular write head
  const demoTimeRef = useRef(0)
  const monoLUT     = useRef(new Float32Array(256 * 3))
  const lastHue     = useRef(-1)

  // ── Geometry (created once) ───────────────────────────────────────────
  const { geo, posArr, colArr, posAttr, colAttr } = useMemo(() => {
    const posArr = new Float32Array(COLS * ROWS * 3)
    const colArr = new Float32Array(COLS * ROWS * 3)

    // Static X / Z positions — only Y changes per frame
    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < COLS; col++) {
        const i = row * COLS + col
        posArr[i * 3]     = (col / (COLS - 1) - 0.5) * W          // X: freq, left→right
        posArr[i * 3 + 1] = 0                                       // Y: amplitude (per-frame)
        posArr[i * 3 + 2] = (0.5 - row / (ROWS - 1)) * D          // Z: row 0 nearest camera
      }
    }

    const posAttr = new THREE.BufferAttribute(posArr, 3)
    const colAttr = new THREE.BufferAttribute(colArr, 3)

    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', posAttr)
    geo.setAttribute('color',    colAttr)
    geo.setIndex(new THREE.BufferAttribute(INDICES, 1))

    return { geo, posArr, colArr, posAttr, colAttr }
  }, [])

  // ── Per-frame update ──────────────────────────────────────────────────
  useFrame((_, delta) => {
    const { maxHeight, colorMode, hue } = configRef.current

    // Rebuild mono LUT only when hue slider changes (not every frame)
    if (colorMode === 'mono' && hue !== lastHue.current) {
      const c = new THREE.Color()
      for (let i = 0; i < 256; i++) {
        c.setHSL(hue / 360, 1, 0.04 + (i / 255) * 0.86)
        monoLUT.current[i * 3] = c.r
        monoLUT.current[i * 3 + 1] = c.g
        monoLUT.current[i * 3 + 2] = c.b
      }
      lastHue.current = hue
    }

    const activeLUT = colorMode === 'mono' ? monoLUT.current : LUT

    // ── 1. Capture new frequency row ────────────────────────────────────
    const head = headRef.current

    if (analyserRef.current) {
      analyserRef.current.getByteFrequencyData(frequencyDataRef.current)
      const src    = frequencyDataRef.current
      const stride = src.length / COLS
      for (let col = 0; col < COLS; col++) {
        // Map COLS bars to available FFT bins; use lower 75% (cut ultrasonic)
        const binIdx = Math.floor(col * stride * 0.75)
        _hist[head * COLS + col] = src[binIdx] / 255
      }
    } else {
      // ── Demo mode: synthetic rhythmic spectrogram ──────────────────
      // Simulates: bass kick + sweeping harmonic + treble shimmer
      demoTimeRef.current += delta
      const t         = demoTimeRef.current
      const beatPhase = (t % 0.5) / 0.5
      const kick      = Math.max(0, 1 - beatPhase * 6)  // sharp attack

      for (let col = 0; col < COLS; col++) {
        const n    = col / (COLS - 1)
        const bass = Math.exp(-n * 5) * (kick * 0.85 + 0.12 * Math.sin(t * 2.3))
        const nN   = 0.12 + 0.22 * (0.5 + 0.5 * Math.sin(t * 0.8))  // sweeping note
        const mid  = Math.exp(-((n - nN) ** 2) / 0.003) * (0.55 + 0.2 * Math.sin(t * 6.5 + n * 9))
        const hi   = n > 0.55 ? Math.abs(Math.sin(t * 13 + n * 24)) * (1 - n) * 0.18 : 0
        _hist[head * COLS + col] = Math.min(1, bass + mid + hi)
      }
    }

    headRef.current = (head + 1) % ROWS

    // ── 2. Write vertex Y positions and colours ─────────────────────
    // Vertex row 0 = newest row (histHead - 1), row ROWS-1 = oldest
    const newHead = headRef.current

    for (let row = 0; row < ROWS; row++) {
      const bufRow = (newHead - 1 - row + ROWS * 2) % ROWS
      // Older rows fade in height and colour toward the horizon
      const fade   = 1 - (row / (ROWS - 1)) * 0.85

      for (let col = 0; col < COLS; col++) {
        const vi  = (row * COLS + col) * 3
        const amp = _hist[bufRow * COLS + col]

        posArr[vi + 1] = amp * maxHeight * fade

        const li = Math.min(255, (amp * 255) | 0) * 3
        colArr[vi]     = activeLUT[li]     * fade
        colArr[vi + 1] = activeLUT[li + 1] * fade
        colArr[vi + 2] = activeLUT[li + 2] * fade
      }
    }

    posAttr.needsUpdate = true
    colAttr.needsUpdate = true
  })

  return (
    <mesh geometry={geo}>
      {/*
        MeshBasicMaterial + vertexColors: each triangle interpolates between
        its vertex colours. No lighting math, no postprocessing needed —
        the colour gradient from the LUT IS the visual effect.
      */}
      <meshBasicMaterial vertexColors />
    </mesh>
  )
}
