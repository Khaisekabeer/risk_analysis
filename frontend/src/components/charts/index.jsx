import {
  LineChart,
  Line,
  BarChart,
  Bar,
  ScatterChart,
  Scatter,
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  XAxis,
  YAxis,
  ZAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  Cell,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import { formatINR } from '../../lib/formatINR'
import { useChartColors } from '../../lib/theme'
import { EmptyState } from '../ui'

const axisProps = (c) => ({
  tick: { fill: c.onVariant, fontSize: 11 },
  axisLine: { stroke: c.chartAxis },
  tickLine: false,
})

const tooltipProps = (c) => ({
  contentStyle: {
    background: c.container,
    border: `1px solid ${c.outline}`,
    borderRadius: 8,
    fontSize: 12,
    color: c.onSurface,
  },
  labelStyle: { color: c.onVariant },
})

export function RiskTrendChart({ data = [] }) {
  const c = useChartColors()
  if (!c.chart1) return null
  if (!data.length) return <EmptyState message="No simulation runs yet for this business process." />
  if (data.length === 1) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-1 text-center">
        <p className="font-mono text-2xl font-medium">{formatINR(data[0].eal, { compact: true })}</p>
        <p className="text-xs text-on-variant">
          Single data point — the trend appears after the next simulation run.
        </p>
      </div>
    )
  }
  return (
    <div className="relative min-h-0 flex-1">
    <div className="absolute inset-0">
    <ResponsiveContainer width="100%" height="100%" minHeight={160}>
      <LineChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid stroke={c.chartGrid} vertical={false} />
        <XAxis dataKey="label" {...axisProps(c)} />
        <YAxis
          {...axisProps(c)}
          width={72}
          tickFormatter={(v) => formatINR(v, { compact: true })}
        />
        <Tooltip {...tooltipProps(c)} formatter={(v, n) => [formatINR(v), n]} />
        <Legend wrapperStyle={{ fontSize: 11, color: c.onVariant }} iconType="plainline" />
        <Line
          isAnimationActive
          animationDuration={450}
          type="monotone"
          dataKey="eal"
          name="Expected Annual Loss"
          stroke={c.chart1}
          strokeWidth={2}
          dot={{ r: 3 }}
        />
        <Line
          isAnimationActive
          animationDuration={450}
          type="monotone"
          dataKey="var95"
          name="Value at Risk (95%)"
          stroke={c.chart3}
          strokeWidth={2}
          strokeDasharray="4 3"
          dot={{ r: 3 }}
        />
      </LineChart>
    </ResponsiveContainer>
    </div>
    </div>
  )
}

/**
 * Multi-series radar. Each entry in `series` draws one polygon, so the same
 * component covers exposure-by-unit and the run comparison that replaced the
 * EAL-vs-VaR line chart. Recharts animates both the initial draw and any
 * later change to the axis set or the series list, which is what makes
 * selecting and overlaying runs read as a transition rather than a redraw.
 */
export function MultiRadar({ data = [], series = [], formatValue, emptyMessage }) {
  const c = useChartColors()
  if (!c.chart1) return null
  if (!data.length || !series.length) {
    return <EmptyState message={emptyMessage || 'Nothing to plot yet.'} />
  }
  const palette = [c.chart1, c.chart3, c.chart2]
  return (
    <div className="relative min-h-0 flex-1">
      <div className="absolute inset-0">
        <ResponsiveContainer width="100%" height="100%" minHeight={200}>
          <RadarChart data={data} margin={{ top: 16, right: 30, left: 30, bottom: 16 }}>
            <PolarGrid stroke={c.chartGrid} />
            <PolarAngleAxis dataKey="name" tick={{ fill: c.onVariant, fontSize: 11 }} />
            <PolarRadiusAxis tick={false} axisLine={false} tickCount={4} />
            <Tooltip
              {...tooltipProps(c)}
              formatter={(v, n) => [formatValue ? formatValue(v) : v, n]}
            />
            <Legend wrapperStyle={{ fontSize: 11, color: c.onVariant }} />
            {series.map((entry, i) => (
              <Radar
                key={entry.key}
                name={entry.name}
                dataKey={entry.key}
                stroke={entry.color || palette[i % palette.length]}
                fill={entry.color || palette[i % palette.length]}
                fillOpacity={0.22}
                strokeWidth={2}
                isAnimationActive
                animationDuration={550}
              />
            ))}
          </RadarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

export function TopRisksBar({ data = [], onSelect }) {
  const c = useChartColors()
  if (!c.chart1) return null
  if (!data.length) return <EmptyState message="No risk data computed yet." />
  return (
    <div className="relative min-h-0 flex-1">
    <div className="absolute inset-0">
    <ResponsiveContainer width="100%" height="100%" minHeight={160}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 72, left: 0, bottom: 0 }}>
        <CartesianGrid stroke={c.chartGrid} horizontal={false} />
        <XAxis type="number" {...axisProps(c)} tickFormatter={(v) => formatINR(v, { compact: true })} />
        <YAxis type="category" dataKey="name" {...axisProps(c)} width={124} />
        <Tooltip {...tooltipProps(c)} formatter={(v) => [formatINR(v), 'EAL']} cursor={{ fill: c.chartGrid }} />
        <Bar
          isAnimationActive
          animationDuration={450}
          dataKey="eal"
          radius={[0, 4, 4, 0]}
          cursor={onSelect ? 'pointer' : 'default'}
          onClick={(e) => onSelect?.(e.id)}
          label={{
            position: 'right',
            fill: c.onVariant,
            fontSize: 11,
            formatter: (v) => formatINR(v, { compact: true }),
          }}
        >
          {data.map((d, i) => (
            <Cell key={d.id ?? i} fill={c.chart1} fillOpacity={1 - i * 0.15} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
    </div>
    </div>
  )
}

export function LossHistogram({ bins = [], eal, var95 }) {
  const c = useChartColors()
  if (!c.chart1) return null
  if (!bins.length) return <EmptyState message="Run a simulation to see the loss distribution." />
  const data = bins.map((b) => ({ mid: (b.start + b.end) / 2, count: b.count }))
  return (
    <div className="relative min-h-0 flex-1">
    <div className="absolute inset-0">
    <ResponsiveContainer width="100%" height="100%" minHeight={160}>
      <BarChart data={data} margin={{ top: 20, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid stroke={c.chartGrid} vertical={false} />
        <XAxis
          dataKey="mid"
          type="number"
          domain={['dataMin', 'dataMax']}
          {...axisProps(c)}
          tickFormatter={(v) => formatINR(v, { compact: true })}
        />
        <YAxis {...axisProps(c)} width={40} />
        <Tooltip
          {...tooltipProps(c)}
          labelFormatter={(v) => formatINR(v)}
          formatter={(v) => [v, 'iterations']}
          cursor={{ fill: c.chartGrid }}
        />
        <Bar
          isAnimationActive
          animationDuration={450}
          dataKey="count" fill={c.chartHist} radius={[2, 2, 0, 0]} />
        {eal != null && (
          <ReferenceLine
            x={eal}
            stroke={c.chart1}
            strokeWidth={2}
            label={{ value: 'EAL', position: 'top', fill: c.chart1, fontSize: 11 }}
          />
        )}
        {var95 != null && (
          <ReferenceLine
            x={var95}
            stroke={c.chart3}
            strokeWidth={2}
            strokeDasharray="4 3"
            label={{ value: 'VaR₉₅', position: 'top', fill: c.chart3, fontSize: 11 }}
          />
        )}
      </BarChart>
    </ResponsiveContainer>
    </div>
    </div>
  )
}

export function InvestmentCurve({ controls = [] }) {
  const c = useChartColors()
  if (!c.chart1) return null
  if (!controls.length) return <EmptyState message="Run the optimizer to see candidate controls." />
  const funded = controls.filter((x) => x.funded)
  const unfunded = controls.filter((x) => !x.funded)
  return (
    <div className="relative min-h-0 flex-1">
    <div className="absolute inset-0">
    <ResponsiveContainer width="100%" height="100%" minHeight={160}>
      <ScatterChart margin={{ top: 12, right: 20, left: 0, bottom: 0 }}>
        <CartesianGrid stroke={c.chartGrid} />
        <XAxis
          type="number"
          dataKey="cost"
          name="Cost"
          {...axisProps(c)}
          tickFormatter={(v) => formatINR(v, { compact: true })}
        />
        <YAxis
          type="number"
          dataKey="reduction"
          name="Reduction"
          {...axisProps(c)}
          width={72}
          tickFormatter={(v) => formatINR(v, { compact: true })}
        />
        <ZAxis range={[90, 90]} />
        <Tooltip
          {...tooltipProps(c)}
          cursor={{ strokeDasharray: '3 3' }}
          formatter={(v, n) => [formatINR(v), n]}
          labelFormatter={() => ''}
        />
        <Legend wrapperStyle={{ fontSize: 11, color: c.onVariant }} />
        <Scatter
          isAnimationActive
          animationDuration={450}
          name="Funded by optimizer" data={funded} fill={c.chart1} />
        <Scatter
          isAnimationActive
          animationDuration={450}
          name="Not funded" data={unfunded} fill={c.chartInactive} />
      </ScatterChart>
    </ResponsiveContainer>
    </div>
    </div>
  )
}

export function CoverageBars({ data = [] }) {
  const c = useChartColors()
  if (!c.chart1) return null
  if (!data.length) return <EmptyState message="No control coverage computed yet." />
  return (
    <div className="relative min-h-0 flex-1">
    <div className="absolute inset-0">
    <ResponsiveContainer width="100%" height="100%" minHeight={160}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid stroke={c.chartGrid} horizontal={false} />
        <XAxis type="number" domain={[0, 1]} tickFormatter={(v) => `${Math.round(v * 100)}%`} {...axisProps(c)} />
        <YAxis type="category" dataKey="name" {...axisProps(c)} width={96} />
        <Tooltip {...tooltipProps(c)} cursor={{ fill: c.chartGrid }} formatter={(v) => `${(v * 100).toFixed(1)}%`} />
        <Legend wrapperStyle={{ fontSize: 11, color: c.onVariant }} />
        <Bar
          isAnimationActive
          animationDuration={450}
          dataKey="mfa" name="MFA" fill={c.chart1} radius={[0, 2, 2, 0]} barSize={7} />
        <Bar
          isAnimationActive
          animationDuration={450}
          dataKey="edr" name="EDR" fill={c.chart2} radius={[0, 2, 2, 0]} barSize={7} />
        <Bar
          isAnimationActive
          animationDuration={450}
          dataKey="backup" name="Backup" fill={c.chart3} radius={[0, 2, 2, 0]} barSize={7} />
      </BarChart>
    </ResponsiveContainer>
    </div>
    </div>
  )
}

/**
 * Investment vs risk-reduction frontier: the optimiser's best achievable
 * reduction at rising budget levels. Both axes are rupee amounts returned by
 * /api/v1/optimization/frontier, so the curve represents the optimisation
 * data rather than a proxy for it.
 */
export function FrontierCurve({ data = [], budget }) {
  const c = useChartColors()
  if (!c.chart1) return null
  if (!data.length) return <EmptyState message="Run the optimizer to plot the frontier." />
  return (
    <div className="relative min-h-0 flex-1">
      <div className="absolute inset-0">
        <ResponsiveContainer width="100%" height="100%" minHeight={160}>
          <LineChart data={data} margin={{ top: 12, right: 20, left: 0, bottom: 0 }}>
            <CartesianGrid stroke={c.chartGrid} vertical={false} />
            <XAxis
              dataKey="budget_inr"
              type="number"
              domain={['dataMin', 'dataMax']}
              {...axisProps(c)}
              tickFormatter={(v) => formatINR(v, { compact: true })}
            />
            <YAxis
              {...axisProps(c)}
              width={72}
              tickFormatter={(v) => formatINR(v, { compact: true })}
            />
            <Tooltip
              {...tooltipProps(c)}
              labelFormatter={(v) => `Budget ${formatINR(v, { compact: true })}`}
              formatter={(v, n) => [formatINR(v), n === 'reduction_inr' ? 'Risk reduction' : 'Spend']}
            />
            <Legend
              wrapperStyle={{ fontSize: 11, color: c.onVariant }}
              formatter={(v) => (v === 'reduction_inr' ? 'Risk reduction' : 'Spend')}
            />
            <Line
              type="monotone"
              dataKey="reduction_inr"
              stroke={c.chart1}
              strokeWidth={2}
              dot={false}
              isAnimationActive
              animationDuration={450}
            />
            <Line
              type="monotone"
              dataKey="spend_inr"
              stroke={c.chart3}
              strokeWidth={2}
              strokeDasharray="4 3"
              dot={false}
              isAnimationActive
              animationDuration={450}
            />
            {budget > 0 && (
              <ReferenceLine
                x={budget}
                stroke={c.chart2}
                strokeWidth={1.5}
                label={{ value: 'Budget', position: 'top', fill: c.chart2, fontSize: 10 }}
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
