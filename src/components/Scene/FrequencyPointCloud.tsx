import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import type { Config } from '../../types'

// ── Constants ─────────────────────────────────────────────────────────────

const N      = 5000   // particle count — dense enough to see density variation
const BASE_R = 3.0    // base sphere radius

// ── Colour LUT: dark-blue → cyan → white (same as terrain / icosphere) ───

const LUT = (() => {
  const lut = new Float32Array(256 * 3)
  const c   = new THREE.Color()
  for (let i = 0; i < 256; i++) {
    const a = i / 255
    c.setHSL(0.58 - a * 0.43, 1.0, 0.04 + a * 0.86)
    lut[i * 3] = c.r;  lut[i * 3 + 1] = c.g;  lut[i * 3 + 2] = c.b
  }
  return lut
})()

// ── Fibonacci sphere home positions (uniform sphere distribution) ─────────
// The golden-angle method spaces N points roughly evenly over a sphere surface.
// Pre-computed once at module load — never recalculated.

const _homePos  = new Float32Array(N * 3)
const _binIndex = new Int32Array(N)         // pre-mapped frequency bin per point

{
  const PHI = Math.PI * (1 + Math.sqrt(5))  // golden angle
  for (let i = 0; i < N; i++) {
    const cosTheta = 1 - 2 * (i + 0.5) / N
    const sinTheta = Math.sqrt(Math.max(0, 1 - cosTheta * cosTheta))
    const phi      = PHI * i

    _homePos[i * 3]     = sinTheta * Math.cos(phi) * BASE_R
    _homePos[i * 3 + 1] = cosTheta * BASE_R          // Y = cos(theta) * R
    _homePos[i * 3 + 2] = sinTheta * Math.sin(phi) * BASE_R

    // Symmetric frequency mapping: |ny| = 1 at poles (bass), 0 at equator (treble)
    const absNy = Math.abs(cosTheta)          // already normalised (divided by BASE_R)
    const binFrac = 1 - absNy                 // 0 at poles → 1 at equator
    _binIndex[i] = Math.min(63, Math.floor(binFrac * 64))
  }
}

// ── Demo frequency buffer (no audio connected) ─────────────────────────────

const _demoData = new Uint8Array(512)

// ── Component ─────────────────────────────────────────────────────────────

export interface FrequencyPointCloudProps {
  analyserRef: React.MutableRefObject<AnalyserNode | null>
  frequencyDataRef: React.MutableRefObject<Uint8Array<ArrayBuffer>>
  configRef: React.MutableRefObject<Config>
}

export function FrequencyPointCloud({ analyserRef, frequencyDataRef, configRef }: FrequencyPointCloudProps) {
  const pointsRef   = useRef<THREE.Points>(null)
  const demoTimeRef = useRef(0)
  const monoLUT     = useRef(new Float32Array(256 * 3))
  const lastHue     = useRef(-1)

  // ── Geometry + material (created once) ────────────────────────────────────
  const { pointsObj, posArr, colArr, posAttr, colAttr } = useMemo(() => {
    const posArr  = new Float32Array(N * 3)
    const colArr  = new Float32Array(N * 3)
    const posAttr = new THREE.BufferAttribute(posArr, 3)
    const colAttr = new THREE.BufferAttribute(colArr, 3)

    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', posAttr)
    geo.setAttribute('color',    colAttr)

    const mat = new THREE.PointsMaterial({
      vertexColors:    true,
      size:            0.07,
      sizeAttenuation: true,      // perspective: near = larger, far = smaller
      /*
        AdditiveBlending: each point adds its colour to whatever's behind it.
        Where points cluster densely (high-amplitude regions), colours stack up
        and create natural "bloom" without any postprocessing pass.
        depthWrite: false prevents z-fighting artefacts between overlapping points.
      */
      blending:        THREE.AdditiveBlending,
      transparent:     true,
      depthWrite:      false,
    })

    const pointsObj = new THREE.Points(geo, mat)

    return { pointsObj, posArr, colArr, posAttr, colAttr }
  }, [])

  // ── Per-frame update ────────────────────────────────────────────────────
  useFrame((_, delta) => {
    const { maxHeight, colorMode, hue } = configRef.current

    // Rebuild mono LUT only when hue changes
    if (colorMode === 'mono' && hue !== lastHue.current) {
      const c = new THREE.Color()
      for (let i = 0; i < 256; i++) {
        c.setHSL(hue / 360, 1, 0.04 + (i / 255) * 0.86)
        monoLUT.current[i * 3]     = c.r
        monoLUT.current[i * 3 + 1] = c.g
        monoLUT.current[i * 3 + 2] = c.b
      }
      lastHue.current = hue
    }

    const activeLUT = colorMode === 'mono' ? monoLUT.current : LUT

    // ── 1. Frequency data ────────────────────────────────────────────────
    let data: Uint8Array<ArrayBuffer>

    if (analyserRef.current) {
      analyserRef.current.getByteFrequencyData(frequencyDataRef.current)
      data = frequencyDataRef.current
    } else {
      // Demo: breathing bass + sweeping harmonic + treble shimmer
      demoTimeRef.current += delta
      const t = demoTimeRef.current
      for (let b = 0; b < _demoData.length; b++) {
        const norm = b / _demoData.length
        const bass = Math.exp(-norm * 4) * (0.7 + 0.3 * Math.sin(t * 1.8))
        const mid  = Math.exp(-((norm - 0.3) ** 2) / 0.008) * (0.55 + 0.25 * Math.sin(t * 4 + norm * 6))
        const hi   = norm > 0.65 ? Math.abs(Math.sin(t * 9 + norm * 18)) * (1 - norm) * 0.2 : 0
        _demoData[b] = Math.min(255, (bass + mid + hi) * 255)
      }
      data = _demoData
    }

    // ── 2. Displace particles from home positions ────────────────────────
    //
    // Each particle's pre-computed bin index maps its sphere position to a
    // frequency band (poles = bass, equator = treble — bilateral symmetry).
    // Amplitude pushes the particle outward along its home direction vector.
    // Bin lookup is a pure array read — no trig in this hot path.
    //
    const dataLen = data.length

    for (let i = 0; i < N; i++) {
      const hx = _homePos[i * 3]
      const hy = _homePos[i * 3 + 1]
      const hz = _homePos[i * 3 + 2]

      // Map pre-computed bin to current data (data may have more bins than 64)
      const rawBin = _binIndex[i]
      const bin    = Math.min(rawBin, dataLen - 1)
      const amp    = data[bin] / 255

      // Displace outward along home-position normal
      const scale  = (BASE_R + amp * maxHeight) / BASE_R
      posArr[i * 3]     = hx * scale
      posArr[i * 3 + 1] = hy * scale
      posArr[i * 3 + 2] = hz * scale

      // Colour from LUT — additive blending makes dense regions naturally brighter
      const li = Math.min(255, (amp * 255) | 0) * 3
      colArr[i * 3]     = activeLUT[li]
      colArr[i * 3 + 1] = activeLUT[li + 1]
      colArr[i * 3 + 2] = activeLUT[li + 2]
    }

    posAttr.needsUpdate = true
    colAttr.needsUpdate = true

    // Slow rotation — reveals the full spherical shape from all angles
    if (pointsRef.current) {
      pointsRef.current.rotation.y += delta * 0.18
      pointsRef.current.rotation.x += delta * 0.04
    }
  })

  return (
    /*
      <primitive> avoids JSX conflicts between R3F's THREE.Points element
      and any HTML/SVG <points> type — consistent with LissajousLine pattern.
    */
    <primitive ref={pointsRef} object={pointsObj} />
  )
}
