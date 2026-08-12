import { useState } from 'react'
import { Scene } from './components/Scene'
import { Controls } from './components/Controls'
import { useAudioAnalyser } from './hooks/useAudioAnalyser'
import { Config, DEFAULT_CONFIG } from './types'

export default function App() {
  const [config, setConfig] = useState<Config>(DEFAULT_CONFIG)

  const {
    analyserRef,
    frequencyDataRef,
    timeDomainRef,
    connectMic,
    connectFile,
    disconnect,
    isConnected,
    sourceType,
    error,
  } = useAudioAnalyser(config.smoothing)

  const handleChange = (update: Partial<Config>) => {
    setConfig((c) => ({ ...c, ...update }))
  }

  return (
    <>
      <Scene
        config={config}
        analyserRef={analyserRef}
        frequencyDataRef={frequencyDataRef}
        timeDomainRef={timeDomainRef}
      />
      <Controls
        config={config}
        onChange={handleChange}
        connectMic={connectMic}
        connectFile={connectFile}
        disconnect={disconnect}
        isConnected={isConnected}
        sourceType={sourceType}
        error={error}
      />
    </>
  )
}
