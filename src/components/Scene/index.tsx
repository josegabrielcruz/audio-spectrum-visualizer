import { useRef, Suspense } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { SpectrogramTerrain } from './SpectrogramTerrain'
import { LissajousLine } from './LissajousLine'
import { MorphingIcosphere } from './MorphingIcosphere'
import { FrequencyPointCloud } from './FrequencyPointCloud'
import type { Config } from '../../types'
import type { UseAudioAnalyserReturn } from '../../hooks/useAudioAnalyser'
import './Scene.css'

interface SceneProps {
  config: Config
  analyserRef: UseAudioAnalyserReturn['analyserRef']
  frequencyDataRef: UseAudioAnalyserReturn['frequencyDataRef']
  timeDomainRef: UseAudioAnalyserReturn['timeDomainRef']
}

export function Scene({ config, analyserRef, frequencyDataRef, timeDomainRef }: SceneProps) {
  const configRef = useRef<Config>(config)
  configRef.current = config

  const mode = config.visualMode

  // Camera and OrbitControls target differ per visualization
  const cameraPos: [number, number, number] =
    mode === 'terrain'    ? [0, 10, 14] :
    mode === 'lissajous'  ? [0, 0, 14]  :
    mode === 'icosphere'  ? [0, 0, 14]  :
    /* pointcloud */        [0, 0, 16]

  const cameraFov   = mode === 'terrain' ? 50 : 45
  const orbitTarget = mode === 'terrain' ? ([0, 1, 0] as [number, number, number]) : ([0, 0, 0] as [number, number, number])

  return (
    <div className="scene-container">
      <Canvas
        camera={{ position: cameraPos, fov: cameraFov }}
        dpr={1}
        gl={{ antialias: true }}
      >
        <Suspense fallback={null}>
          {mode === 'terrain' && (
            <SpectrogramTerrain
              analyserRef={analyserRef}
              frequencyDataRef={frequencyDataRef}
              configRef={configRef}
            />
          )}
          {mode === 'lissajous' && (
            <LissajousLine
              analyserRef={analyserRef}
              timeDomainRef={timeDomainRef}
              configRef={configRef}
            />
          )}
          {mode === 'icosphere' && (
            <MorphingIcosphere
              analyserRef={analyserRef}
              frequencyDataRef={frequencyDataRef}
              configRef={configRef}
            />
          )}
          {mode === 'pointcloud' && (
            <FrequencyPointCloud
              analyserRef={analyserRef}
              frequencyDataRef={frequencyDataRef}
              configRef={configRef}
            />
          )}
        </Suspense>

        <OrbitControls
          target={orbitTarget}
          enableDamping
          dampingFactor={0.05}
          enableZoom={true}
          minPolarAngle={0}
          maxPolarAngle={Math.PI * 0.75}
          autoRotate={false}
        />
      </Canvas>
    </div>
  )
}
