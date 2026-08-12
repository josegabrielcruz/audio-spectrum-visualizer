import { useCallback, useEffect, useRef, useState } from 'react'

export type AudioSourceType = 'mic' | 'file' | null

export interface UseAudioAnalyserReturn {
  /** The live AnalyserNode — read by the R3F render loop via ref to avoid re-renders */
  analyserRef: React.MutableRefObject<AnalyserNode | null>
  /** Pre-allocated buffer for getByteFrequencyData() — reused every frame */
  frequencyDataRef: React.MutableRefObject<Uint8Array<ArrayBuffer>>
  /** Pre-allocated buffer for getFloatTimeDomainData() — used by Lissajous */
  timeDomainRef: React.MutableRefObject<Float32Array>
  connectMic: () => Promise<void>
  connectFile: (file: File) => void
  disconnect: () => void
  isConnected: boolean
  sourceType: AudioSourceType
  error: string | null
}

const FFT_SIZE = 1024 // 512 usable frequency bins — more than enough for 256 bars

export function useAudioAnalyser(smoothing: number): UseAudioAnalyserReturn {
  const analyserRef = useRef<AnalyserNode | null>(null)
  const frequencyDataRef = useRef<Uint8Array<ArrayBuffer>>(new Uint8Array(FFT_SIZE / 2))
  const timeDomainRef   = useRef<Float32Array>(new Float32Array(FFT_SIZE))

  const contextRef = useRef<AudioContext | null>(null)
  const sourceRef = useRef<MediaStreamAudioSourceNode | AudioBufferSourceNode | null>(null)
  const streamRef = useRef<MediaStream | null>(null)

  const [isConnected, setIsConnected] = useState(false)
  const [sourceType, setSourceType] = useState<AudioSourceType>(null)
  const [error, setError] = useState<string | null>(null)

  // Keep smoothing in sync without reconnecting
  useEffect(() => {
    if (analyserRef.current) {
      analyserRef.current.smoothingTimeConstant = smoothing
    }
  }, [smoothing])

  // ── Internal helpers ──────────────────────────────────────────────────

  function teardown() {
    if (sourceRef.current) {
      try {
        sourceRef.current.disconnect()
        if ('stop' in sourceRef.current) (sourceRef.current as AudioBufferSourceNode).stop()
      } catch { /* already stopped */ }
      sourceRef.current = null
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
    if (analyserRef.current) {
      try { analyserRef.current.disconnect() } catch { /* ignore */ }
      analyserRef.current = null
    }
    if (contextRef.current && contextRef.current.state !== 'closed') {
      contextRef.current.close()
      contextRef.current = null
    }
  }

  function makeAnalyser(ctx: AudioContext): AnalyserNode {
    const node = ctx.createAnalyser()
    node.fftSize = FFT_SIZE
    node.smoothingTimeConstant = smoothing
    analyserRef.current = node
    frequencyDataRef.current = new Uint8Array(node.frequencyBinCount)
    timeDomainRef.current   = new Float32Array(node.fftSize)
    return node
  }

  // ── Public API ────────────────────────────────────────────────────────

  const connectMic = useCallback(async () => {
    setError(null)
    teardown()
    try {
      const ctx = new AudioContext()
      contextRef.current = ctx
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
      streamRef.current = stream
      const analyser = makeAnalyser(ctx)
      // Mic source → analyser (NOT connected to destination — we don't want speaker feedback)
      const source = ctx.createMediaStreamSource(stream)
      source.connect(analyser)
      sourceRef.current = source
      setIsConnected(true)
      setSourceType('mic')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Microphone access denied')
      teardown()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const connectFile = useCallback((file: File) => {
    setError(null)
    teardown()
    const reader = new FileReader()
    reader.onload = async (ev) => {
      try {
        const ctx = new AudioContext()
        contextRef.current = ctx
        const arrayBuffer = ev.target!.result as ArrayBuffer
        const audioBuffer = await ctx.decodeAudioData(arrayBuffer)
        const analyser = makeAnalyser(ctx)
        const source = ctx.createBufferSource()
        source.buffer = audioBuffer
        source.loop = true
        source.connect(analyser)
        source.connect(ctx.destination) // play audio through speakers
        source.start()
        sourceRef.current = source
        setIsConnected(true)
        setSourceType('file')
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not decode audio file')
        teardown()
      }
    }
    reader.readAsArrayBuffer(file)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const disconnect = useCallback(() => {
    teardown()
    setIsConnected(false)
    setSourceType(null)
    setError(null)
  }, [])

  // Cleanup on unmount
  useEffect(() => () => teardown(), []) // eslint-disable-line react-hooks/exhaustive-deps

  return {
    analyserRef,
    frequencyDataRef,
    timeDomainRef,
    connectMic,
    connectFile,
    disconnect,
    isConnected,
    sourceType,
    error,
  }
}
