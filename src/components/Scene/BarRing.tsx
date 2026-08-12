import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import type { Config } from '../../types'

// ── Constants ─────────────────────────────────────────────────────────────

const MAX_BARS = 256
const BAR_W = 0.08        // main bar width / depth
const GLOW_W = BAR_W * 8  // halo bar is 8× wider — creates the bloom-like aura

// Module-level allocations — never recreated during the animation loop
const _matrix = new THREE.Matrix4()
const _me = _matrix.elements    // direct Float32Array ref
const _color = new THREE.Color()
const _hideMatrix = new THREE.Matrix4()
_hideMatrix.makeScale(0, 0, 0)
let _demoData: Uint8Array = new Uint8Array(MAX_BARS)

// ── Component ─────────────────────────────────────────────────────────────

interface BarRingProps {
  analyserRef: React.MutableRefObject<AnalyserNode | null>
  frequencyDataRef: React.MutableRefObject<Uint8Array<ArrayBuffer>>
  configRef: React.MutableRefObject<Config>
}

export function BarRing({ analyserRef, frequencyDataRef, configRef }: BarRingProps) {
  const meshRef     = useRef<THREE.InstancedMesh>(null)  // solid main bars
  const glowMeshRef = useRef<THREE.InstancedMesh>(null)  // wide additive-blend halos
  const demoTimeRef = useRef(0)

  useFrame((_, delta) => {
    const mesh     = meshRef.current
    const glowMesh = glowMeshRef.current
    if (!mesh || !glowMesh) return

    const { barCount, radius, maxHeight, colorMode, hue } = configRef.current

    // ── Frequency data ────────────────────────────────────────────────────
    let data: Uint8Array

    if (analyserRef.current) {
      analyserRef.current.getByteFrequencyData(frequencyDataRef.current)
      data = frequencyDataRef.current
    } else {
      demoTimeRef.current += delta
      const t = demoTimeRef.current
      for (let i = 0; i < MAX_BARS; i++) {
        const norm = i / MAX_BARS
        const wave =
          Math.sin(t * 1.8 + norm * Math.PI * 4) * 0.4 +
          Math.sin(t * 0.9 + norm * Math.PI * 8) * 0.3 +
          Math.sin(t * 0.4 + norm * Math.PI * 2) * 0.3
        _demoData[i] = ((wave * 0.5 + 0.5) * 140) | 0
      }
      data = _demoData
    }

    // ── Update both meshes ────────────────────────────────────────────────
    for (let i = 0; i < MAX_BARS; i++) {
      if (i >= barCount) {
        mesh.setMatrixAt(i, _hideMatrix)
        glowMesh.setMatrixAt(i, _hideMatrix)
        continue
      }

      const angle    = (i / barCount) * Math.PI * 2
      const binIndex = Math.floor((i / barCount) * data.length * 0.75)
      const amp      = (data[binIndex] ?? 0) / 255
      const height   = Math.max(0.02, amp * maxHeight)
      const cosA     = Math.cos(angle)
      const sinA     = Math.sin(angle)
      const tx       = cosA * radius
      const tz       = sinA * radius
      const ty       = height * 0.5

      // ── Main bar matrix (T × Ry(-angle) × S(BAR_W, height, BAR_W)) ──────
      _me[0]  =  cosA * BAR_W;  _me[1]  = 0;       _me[2]  = sinA * BAR_W;  _me[3]  = 0
      _me[4]  = 0;              _me[5]  = height;  _me[6]  = 0;             _me[7]  = 0
      _me[8]  = -sinA * BAR_W; _me[9]  = 0;       _me[10] = cosA * BAR_W;  _me[11] = 0
      _me[12] = tx;             _me[13] = ty;      _me[14] = tz;            _me[15] = 1
      mesh.setMatrixAt(i, _matrix)

      // ── Glow halo matrix — identical except much wider ────────────────────
      // The glow mesh is 5× wider on X/Z, same height and position.
      // Rendered with additive blending + low opacity → soft neon halo.
      _me[0]  =  cosA * GLOW_W;
      _me[2]  =  sinA * GLOW_W;
      _me[8]  = -sinA * GLOW_W;
      _me[10] =  cosA * GLOW_W;
      // height, position, rotation cols unchanged from main bar write above
      glowMesh.setMatrixAt(i, _matrix)

      // ── Colour — lightness encodes amplitude ──────────────────────────────
      const lightness = 0.4 + amp * 0.5   // 0.4 (quiet) → 0.9 (loud)
      if (colorMode === 'frequency') {
        _color.setHSL(i / barCount, 1, lightness)
      } else {
        _color.setHSL(hue / 360, 1, lightness)
      }
      mesh.setColorAt(i, _color)
      // Glow uses a fixed material color (no vertexColors) — see material below
    }

    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true

    glowMesh.instanceMatrix.needsUpdate = true
  })

  return (
    <>
      {/* Solid main bars — rendered normally into depth buffer */}
      <instancedMesh ref={meshRef} args={[undefined, undefined, MAX_BARS]}>
        <boxGeometry args={[1, 1, 1]} />
        <meshBasicMaterial vertexColors />
      </instancedMesh>

      {/*
        Glow halos — 8× wider, fixed white color, additive blending.
        Using a plain white color (no vertexColors) avoids a Three.js color-space
        issue where instanceColor + AdditiveBlending + transparent produces black.
        White additive glow is also visually correct — real bloom/neon light halos
        are luminous white regardless of the source color; the hue lives on the bars.
        depthTest={false}: halos render on top of everything, never occluded.
      */}
      <instancedMesh ref={glowMeshRef} args={[undefined, undefined, MAX_BARS]}>
        <boxGeometry args={[1, 1, 1]} />
        <meshBasicMaterial
          color={new THREE.Color(1, 1, 1)}
          transparent
          opacity={0.08}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          depthTest={false}
        />
      </instancedMesh>
    </>
  )
}
