import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import type { Config } from '../../types'

// ── Constants ─────────────────────────────────────────────────────────────

const N  = 1024   // points along the line
const W  = 5.5    // X/Y extent (maps [-1,1] time-domain to ±W)
const D  = 8      // Z depth (line spreads into the distance)

// Phase offset for Y channel: quarter period = Lissajous X vs X+¼ creates oval / figure-8 patterns
const PHASE_OFFSET = N / 4 | 0  // 256 samples

// ── Colour gradient LUT: cyan (start) → violet (end) ─────────────────────

const LISSAJOUS_LUT = (() => {
  const lut = new Float32Array(N * 3)
  const c   = new THREE.Color()
  for (let i = 0; i < N; i++) {
    const t = i / (N - 1)
    // Hue sweeps cyan (0.53) → indigo (0.72) along the line length
    c.setHSL(0.53 + t * 0.19, 1.0, 0.55)
    lut[i * 3] = c.r;  lut[i * 3 + 1] = c.g;  lut[i * 3 + 2] = c.b
  }
  return lut
})()

// ── Persistent demo buffer (survives StrictMode remounts) ─────────────────

const _demoData = new Float32Array(N)

// ── Component ─────────────────────────────────────────────────────────────

export interface LissajousLineProps {
  analyserRef: React.MutableRefObject<AnalyserNode | null>
  timeDomainRef: React.MutableRefObject<Float32Array>
  configRef: React.MutableRefObject<Config>
}

export function LissajousLine({ analyserRef, timeDomainRef, configRef }: LissajousLineProps) {
  const demoTimeRef = useRef(0)
  const monoLUT     = useRef(new Float32Array(N * 3))
  const lastHue     = useRef(-1)

  const { lineObj, posArr, colArr, posAttr, colAttr } = useMemo(() => {
    const posArr = new Float32Array(N * 3)
    const colArr = new Float32Array(N * 3)

    const posAttr = new THREE.BufferAttribute(posArr, 3)
    const colAttr = new THREE.BufferAttribute(colArr, 3)

    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', posAttr)
    geo.setAttribute('color',    colAttr)

    const mat = new THREE.LineBasicMaterial({ vertexColors: true })
    const lineObj = new THREE.Line(geo, mat)

    return { lineObj, posArr, colArr, posAttr, colAttr }
  }, [])

  useFrame((_, delta) => {
    const { colorMode, hue } = configRef.current

    // Rebuild mono LUT only when hue changes
    if (colorMode === 'mono' && hue !== lastHue.current) {
      const c = new THREE.Color()
      for (let i = 0; i < N; i++) {
        const t = i / (N - 1)
        c.setHSL(hue / 360, 1.0, 0.3 + t * 0.35)
        monoLUT.current[i * 3] = c.r
        monoLUT.current[i * 3 + 1] = c.g
        monoLUT.current[i * 3 + 2] = c.b
      }
      lastHue.current = hue
    }

    const activeLUT = colorMode === 'mono' ? monoLUT.current : LISSAJOUS_LUT

    // ── 1. Get time-domain data ────────────────────────────────────────
    let data: Float32Array

    if (analyserRef.current) {
      analyserRef.current.getFloatTimeDomainData(timeDomainRef.current)
      data = timeDomainRef.current
    } else {
      // Demo: evolving parametric Lissajous figure
      // The ratio a:b slowly shifts, causing the figure to precess beautifully
      demoTimeRef.current += delta
      const t  = demoTimeRef.current
      const a  = 2 + Math.sin(t * 0.07) * 0.5   // slowly drifts around 2
      const b  = 3 + Math.cos(t * 0.11) * 0.5   // slowly drifts around 3
      const d  = t * 0.4                          // phase offset rotates the figure
      for (let i = 0; i < N; i++) {
        const s = (i / N) * Math.PI * 2
        _demoData[i] = Math.sin(a * s + d)        // raw sine — also used for Y via PHASE_OFFSET
      }
      // Overwrite second half as the "Y phase-shifted channel"
      // (real data does this naturally via the circular PHASE_OFFSET)
      for (let i = 0; i < N; i++) {
        const s = (i / N) * Math.PI * 2
        _demoData[(i + PHASE_OFFSET) % N] = Math.sin(b * s)
      }
      data = _demoData
    }

    // ── 2. Map data to 3D positions ────────────────────────────────────
    // X = sample at i (one "channel")
    // Y = sample at i + PHASE_OFFSET (quarter-period shift — creates Lissajous patterns)
    // Z = linear spread into depth

    for (let i = 0; i < N; i++) {
      const x    = data[i] * W
      const y    = data[(i + PHASE_OFFSET) % N] * W
      const z    = (i / (N - 1) - 0.5) * D

      posArr[i * 3]     = x
      posArr[i * 3 + 1] = y
      posArr[i * 3 + 2] = z

      // Colour: base gradient modulated by instantaneous amplitude
      // Bright at peaks, dim at zero-crossings — makes waveform shape visible
      const amp = Math.abs(x / W) * 0.6 + 0.4   // 0.4 baseline, up to 1.0 at full amplitude
      colArr[i * 3]     = activeLUT[i * 3]     * amp
      colArr[i * 3 + 1] = activeLUT[i * 3 + 1] * amp
      colArr[i * 3 + 2] = activeLUT[i * 3 + 2] * amp
    }

    posAttr.needsUpdate = true
    colAttr.needsUpdate = true
  })

  return (
    /*
      Use <primitive> to avoid JSX type conflicts between HTML/SVG <line>
      and Three.js THREE.Line. The lineObj is created once in useMemo and
      its geometry attributes are updated in-place each frame via posAttr/colAttr.
    */
    <primitive object={lineObj} />
  )
}
