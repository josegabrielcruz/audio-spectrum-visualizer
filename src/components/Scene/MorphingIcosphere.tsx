import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import type { Config } from '../../types'

// ── Geometry constants ────────────────────────────────────────────────────

const DETAIL  = 4      // IcosahedronGeometry subdivision: 2 → 960 vertices (non-indexed)
const BASE_R  = 2.5    // base sphere radius before audio displacement

// ── Colour LUT: same thermal gradient as the terrain ─────────────────────

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

// ── Demo frequency buffer (no audio connected) ─────────────────────────────

const _demoFreq = new Uint8Array(512)

// ── Component ─────────────────────────────────────────────────────────────

export interface IcosphereProps {
  analyserRef: React.MutableRefObject<AnalyserNode | null>
  frequencyDataRef: React.MutableRefObject<Uint8Array<ArrayBuffer>>
  configRef: React.MutableRefObject<Config>
}

export function MorphingIcosphere({ analyserRef, frequencyDataRef, configRef }: IcosphereProps) {
  const meshRef    = useRef<THREE.Mesh>(null)
  const demoTimeRef = useRef(0)
  const monoLUT    = useRef(new Float32Array(256 * 3))
  const lastHue    = useRef(-1)

  // ── Geometry (created once) ─────────────────────────────────────────────
  const { geo, origPositions, posArr, colArr, posAttr, colAttr } = useMemo(() => {
    const geo = new THREE.IcosahedronGeometry(BASE_R, DETAIL)

    // All vertices lie on a sphere of radius BASE_R.
    // Store their normalised directions (unit vectors = vertex normals).
    const rawPos = geo.getAttribute('position') as THREE.BufferAttribute
    const N      = rawPos.count

    const origPositions = new Float32Array(N * 3)
    for (let i = 0; i < N; i++) {
      origPositions[i * 3]     = rawPos.getX(i) / BASE_R
      origPositions[i * 3 + 1] = rawPos.getY(i) / BASE_R
      origPositions[i * 3 + 2] = rawPos.getZ(i) / BASE_R
    }

    // Replace the static attribute with dynamic Float32Arrays we'll update each frame
    const posArr  = new Float32Array(N * 3)
    const colArr  = new Float32Array(N * 3)
    const posAttr = new THREE.BufferAttribute(posArr, 3)
    const colAttr = new THREE.BufferAttribute(colArr, 3)

    geo.setAttribute('position', posAttr)
    geo.setAttribute('color',    colAttr)

    return { geo, origPositions, posArr, colArr, posAttr, colAttr }
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

    // ── 1. Frequency data ───────────────────────────────────────────────
    let data: Uint8Array | Float32Array

    if (analyserRef.current) {
      analyserRef.current.getByteFrequencyData(frequencyDataRef.current)
      data = frequencyDataRef.current
    } else {
      // Demo: breathing bass + sweeping mid + treble shimmer
      demoTimeRef.current += delta
      const t = demoTimeRef.current
      for (let b = 0; b < _demoFreq.length; b++) {
        const norm = b / _demoFreq.length
        const bass = Math.exp(-norm * 4) * (0.75 + 0.25 * Math.sin(t * 1.8))
        const mid  = Math.exp(-((norm - 0.3) ** 2) / 0.008) * (0.5 + 0.3 * Math.sin(t * 4.5 + norm * 6))
        const hi   = norm > 0.65 ? Math.abs(Math.sin(t * 9 + norm * 18)) * (1 - norm) * 0.2 : 0
        _demoFreq[b] = Math.min(255, (bass + mid + hi) * 255)
      }
      data = _demoFreq
    }

    // ── 2. Morph vertices ─────────────────────────────────────────────────
    //
    // Frequency → vertex mapping (symmetric):
    //   |ny| = 1  → poles     → low frequencies (bass)
    //   |ny| = 0  → equator   → high frequencies (treble)
    //
    // This makes the sphere swell at both poles for bass-heavy music and
    // ripple around the equator for treble, like a pulsing energy orb.
    //
    const N       = origPositions.length / 3
    const dataLen = data.length

    for (let i = 0; i < N; i++) {
      const nx = origPositions[i * 3]
      const ny = origPositions[i * 3 + 1]
      const nz = origPositions[i * 3 + 2]

      // Polar angle from nearest pole: 0 at pole → 1 at equator
      const absNy     = Math.abs(ny)
      const binFrac   = 1 - absNy                         // 0 at poles, 1 at equator
      const binIdx    = Math.min(Math.floor(binFrac * (dataLen - 1)), dataLen - 1)
      const amp       = data[binIdx] / 255

      const r = BASE_R + amp * maxHeight
      posArr[i * 3]     = nx * r
      posArr[i * 3 + 1] = ny * r
      posArr[i * 3 + 2] = nz * r

      const li = Math.min(255, (amp * 255) | 0) * 3
      colArr[i * 3]     = activeLUT[li]
      colArr[i * 3 + 1] = activeLUT[li + 1]
      colArr[i * 3 + 2] = activeLUT[li + 2]
    }

    posAttr.needsUpdate = true
    colAttr.needsUpdate = true

    // Slow rotation adds life — like a slowly revolving energy orb
    if (meshRef.current) {
      meshRef.current.rotation.y += delta * 0.25
    }
  })

  return (
    <mesh ref={meshRef} geometry={geo}>
      {/*
        MeshBasicMaterial + vertexColors: no lighting math, colours ARE the glow.
        DoubleSide ensures inner faces are visible during deep deformation.
      */}
      <meshBasicMaterial vertexColors side={THREE.DoubleSide} />
    </mesh>
  )
}
