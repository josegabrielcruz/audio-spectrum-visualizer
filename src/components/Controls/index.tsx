import { useRef, useState } from 'react'
import type { Config } from '../../types'
import type { UseAudioAnalyserReturn } from '../../hooks/useAudioAnalyser'
import './Controls.css'

interface ControlsProps {
  config: Config
  onChange: (update: Partial<Config>) => void
  connectMic: UseAudioAnalyserReturn['connectMic']
  connectFile: UseAudioAnalyserReturn['connectFile']
  disconnect: UseAudioAnalyserReturn['disconnect']
  isConnected: boolean
  sourceType: UseAudioAnalyserReturn['sourceType']
  error: string | null
}

export function Controls({
  config,
  onChange,
  connectMic,
  connectFile,
  disconnect,
  isConnected,
  sourceType,
  error,
}: ControlsProps) {
  const [open, setOpen] = useState(true)
  const [micPending, setMicPending] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleMic = async () => {
    setMicPending(true)
    await connectMic()
    setMicPending(false)
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) connectFile(file)
    // Reset input so the same file can be re-selected
    e.target.value = ''
  }

  return (
    <div className="controls">
      <button className="controls__header" onClick={() => setOpen((o) => !o)}>
        <span>Parameters</span>
        <span className="controls__chevron">{open ? '▼' : '▲'}</span>
      </button>

      {open && (
        <div className="controls__body">

          {/* ── Audio Source ─────────────────────────────────────── */}
          <div className="controls__section-label">Source</div>

          <div className="controls__source-row">
            <button
              className={`controls__source-btn ${isConnected && sourceType === 'mic' ? 'active' : ''}`}
              onClick={handleMic}
              disabled={micPending}
            >
              {micPending ? 'Requesting…' : '🎤 Mic'}
            </button>
            <button
              className={`controls__source-btn ${isConnected && sourceType === 'file' ? 'active' : ''}`}
              onClick={() => fileInputRef.current?.click()}
            >
              📁 File
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="audio/*"
              style={{ display: 'none' }}
              onChange={handleFileChange}
            />
          </div>

          {isConnected && (
            <div className="controls__status">
              <span className="controls__status-dot" />
              <span>{sourceType === 'mic' ? 'Microphone active' : 'File playing (loop)'}</span>
              <button className="controls__disconnect" onClick={disconnect}>Stop</button>
            </div>
          )}

          {error && <div className="controls__error">{error}</div>}

          {/* ── Visualisation ─────────────────────────────────────── */}          <div className="controls__section-label">View</div>

          <div className="controls__row">
            <span className="controls__label">Mode</span>
            <div className="controls__toggle-group">
              <button
                className={config.visualMode === 'terrain' ? 'active' : ''}
                onClick={() => onChange({ visualMode: 'terrain' })}
              >
                Terrain
              </button>
              <button
                className={config.visualMode === 'lissajous' ? 'active' : ''}
                onClick={() => onChange({ visualMode: 'lissajous' })}
              >
                Lissajous
              </button>
              <button
                className={config.visualMode === 'icosphere' ? 'active' : ''}
                onClick={() => onChange({ visualMode: 'icosphere' })}
              >
                Sphere
              </button>
              <button
                className={config.visualMode === 'pointcloud' ? 'active' : ''}
                onClick={() => onChange({ visualMode: 'pointcloud' })}
              >
                Cloud
              </button>
            </div>
          </div>

          {/* ── Visualisation ───────────────────────────────────── */}          <div className="controls__section-label">Visualisation</div>

          <Slider label="Max Height" value={config.maxHeight}  min={0.5} max={6}   step={0.1}
            display={config.maxHeight.toFixed(1)}
            onChange={(v) => onChange({ maxHeight: v })} />

          {/* ── Audio ─────────────────────────────────────────────── */}
          <div className="controls__section-label">Audio</div>

          <Slider label="Smoothing"  value={config.smoothing}  min={0}   max={0.95} step={0.01}
            display={config.smoothing.toFixed(2)}
            onChange={(v) => onChange({ smoothing: v })} />

          {/* ── Camera ────────────────────────────────────────────── */}
          <div className="controls__section-label">Camera</div>

          {/* ── Colour ────────────────────────────────────────────── */}
          <div className="controls__section-label">Color</div>

          <div className="controls__row">
            <span className="controls__label">Mode</span>
            <div className="controls__toggle-group">
              <button
                className={config.colorMode === 'frequency' ? 'active' : ''}
                onClick={() => onChange({ colorMode: 'frequency' })}
              >
                Spectrum
              </button>
              <button
                className={config.colorMode === 'mono' ? 'active' : ''}
                onClick={() => onChange({ colorMode: 'mono' })}
              >
                Mono
              </button>
            </div>
          </div>

          {config.colorMode === 'mono' && (
            <Slider label="Hue" value={config.hue} min={0} max={360} step={1}
              display={`${config.hue}°`}
              onChange={(v) => onChange({ hue: v })} />
          )}

        </div>
      )}
    </div>
  )
}

// ── Slider sub-component ────────────────────────────────────────────────────

interface SliderProps {
  label: string
  value: number
  min: number
  max: number
  step: number
  display: string
  onChange: (v: number) => void
}

function Slider({ label, value, min, max, step, display, onChange }: SliderProps) {
  return (
    <div className="controls__slider">
      <div className="controls__slider-header">
        <span>{label}</span>
        <span className="controls__slider-value">{display}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
      />
    </div>
  )
}
