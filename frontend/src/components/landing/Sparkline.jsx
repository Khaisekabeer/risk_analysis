import { useEffect, useRef, useState } from 'react'
import { useChartColors } from '../../lib/theme'

const POINTS = 48

/** Live-ticking risk score sparkline for the monitoring feature card. */
export default function Sparkline({ onValue }) {
  const ref = useRef(null)
  const dataRef = useRef([])
  const colors = useChartColors()
  const [, force] = useState(0)

  useEffect(() => {
    let v = 24.6
    const start = v
    const seeded = []
    for (let i = 0; i < POINTS; i++) {
      v = Math.min(30, Math.max(17, v + (Math.random() - 0.52) * 0.9))
      seeded.push(v)
    }
    dataRef.current = seeded
    onValue?.(v, v - start)

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduced) {
      force((n) => n + 1)
      return
    }
    const id = setInterval(() => {
      if (document.hidden) return
      v = Math.min(30, Math.max(17, v + (Math.random() - 0.5) * 1.1))
      dataRef.current = [...dataRef.current.slice(1), v]
      onValue?.(v, v - start)
      force((n) => n + 1)
    }, 900)
    return () => clearInterval(id)
  }, [onValue])

  useEffect(() => {
    const cv = ref.current
    if (!cv || !colors.chart1) return
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const w = cv.clientWidth || 300
    const h = 72
    cv.width = Math.round(w * dpr)
    cv.height = h * dpr
    const c = cv.getContext('2d')
    c.setTransform(dpr, 0, 0, dpr, 0, 0)
    c.clearRect(0, 0, w, h)

    const data = dataRef.current
    if (!data.length) return
    const min = 16
    const max = 32
    const pad = 6
    const px = (i) => (i / (data.length - 1)) * w
    const py = (val) => pad + (1 - (val - min) / (max - min)) * (h - pad * 2)

    c.beginPath()
    c.moveTo(0, h)
    data.forEach((val, i) => c.lineTo(px(i), py(val)))
    c.lineTo(w, h)
    c.closePath()
    c.fillStyle = `${colors.chart1}14`
    c.fill()

    c.beginPath()
    data.forEach((val, i) => (i ? c.lineTo(px(i), py(val)) : c.moveTo(px(i), py(val))))
    c.strokeStyle = colors.chart1
    c.lineWidth = 1.5
    c.stroke()

    const last = data[data.length - 1]
    c.fillStyle = colors.chart1
    c.beginPath()
    c.arc(px(data.length - 1), py(last), 2.5, 0, Math.PI * 2)
    c.fill()
  })

  return <canvas ref={ref} aria-hidden="true" className="mt-2 block h-[72px] w-full" />
}
