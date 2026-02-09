import { useCallback, useEffect, useMemo, useState } from 'react'
import type { AppConfig, UsageDailySummary, UsageDashboardSnapshot } from '@shared/types'
import styles from './UsageDashboard.module.css'

interface UsageDashboardProps {
  config: AppConfig
  onUpdateConfig: (partial: Partial<AppConfig>) => Promise<AppConfig>
  onClose: () => void
}

const DAY_LIMIT = 30
const TREND_WINDOWS = [7, 30] as const
type TrendWindow = (typeof TREND_WINDOWS)[number]
type TrendMetric = 'tokens' | 'cost'

interface TrendPoint {
  date: string
  label: string
  tokens: number
  costUsd: number
  value: number
}

export function UsageDashboard({ config, onUpdateConfig, onClose }: UsageDashboardProps) {
  const [snapshot, setSnapshot] = useState<UsageDashboardSnapshot | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [tokenBudgetInput, setTokenBudgetInput] = useState('')
  const [costBudgetInput, setCostBudgetInput] = useState('')
  const [warningThresholdInput, setWarningThresholdInput] = useState('80')
  const [trendWindow, setTrendWindow] = useState<TrendWindow>(7)
  const [trendMetric, setTrendMetric] = useState<TrendMetric>('tokens')

  useEffect(() => {
    setTokenBudgetInput(config.usageDailyTokenBudget > 0 ? String(config.usageDailyTokenBudget) : '')
    setCostBudgetInput(
      config.usageDailyCostBudgetUsd > 0 ? String(config.usageDailyCostBudgetUsd) : ''
    )
    setWarningThresholdInput(String(config.usageBudgetWarningThresholdPct))
  }, [
    config.usageDailyTokenBudget,
    config.usageDailyCostBudgetUsd,
    config.usageBudgetWarningThresholdPct
  ])

  const refresh = useCallback(async () => {
    setIsLoading(true)
    try {
      const next = await window.hydra.getUsageDashboard({ days: DAY_LIMIT })
      setSnapshot(next)
      setSelectedDate((prev) => {
        if (prev && next.days.some((day) => day.date === prev)) return prev
        return next.today?.date ?? next.days[0]?.date ?? null
      })
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()

    const unsubscribe = window.hydra.onUsageUpdated((next) => {
      setSnapshot(next)
      setSelectedDate((prev) => {
        if (prev && next.days.some((day) => day.date === prev)) return prev
        return next.today?.date ?? next.days[0]?.date ?? null
      })
    })

    const interval = setInterval(() => {
      void refresh()
    }, 8000)

    return () => {
      unsubscribe()
      clearInterval(interval)
    }
  }, [refresh])

  const selectedSummary = useMemo<UsageDailySummary | null>(() => {
    if (!snapshot) return null
    if (selectedDate) {
      return snapshot.days.find((day) => day.date === selectedDate) ?? null
    }
    return snapshot.today ?? snapshot.days[0] ?? null
  }, [snapshot, selectedDate])

  const trendSeries = useMemo<TrendPoint[]>(() => {
    return buildTrendSeries(snapshot?.days ?? [], trendWindow, trendMetric)
  }, [snapshot, trendWindow, trendMetric])

  const trendTotal = useMemo(
    () => trendSeries.reduce((sum, point) => sum + point.value, 0),
    [trendSeries]
  )
  const trendActiveDays = useMemo(
    () => trendSeries.filter((point) => point.value > 0).length,
    [trendSeries]
  )
  const trendAvgPerDay = trendTotal / trendWindow
  const trendProjected30 = trendAvgPerDay * 30

  const handleSaveBudgets = useCallback(async () => {
    const parsedTokens = Number.parseInt(tokenBudgetInput.trim(), 10)
    const parsedCost = Number.parseFloat(costBudgetInput.trim())
    const parsedThreshold = Number.parseInt(warningThresholdInput.trim(), 10)

    const usageDailyTokenBudget =
      Number.isFinite(parsedTokens) && parsedTokens > 0 ? parsedTokens : 0
    const usageDailyCostBudgetUsd =
      Number.isFinite(parsedCost) && parsedCost > 0 ? parsedCost : 0
    const usageBudgetWarningThresholdPct = Number.isFinite(parsedThreshold)
      ? Math.min(99, Math.max(1, parsedThreshold))
      : 80

    setIsSaving(true)
    try {
      await onUpdateConfig({
        usageDailyTokenBudget,
        usageDailyCostBudgetUsd,
        usageBudgetWarningThresholdPct
      })
    } finally {
      setIsSaving(false)
    }
  }, [tokenBudgetInput, costBudgetInput, warningThresholdInput, onUpdateConfig])

  const budget = snapshot?.budget

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.panel} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <div>
            <h2>Usage Dashboard</h2>
            <p className={styles.subtitle}>
              Usage aggregated by day, project, and agent from CLI output.
            </p>
          </div>
          <button className={styles.closeBtn} type="button" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className={styles.controls}>
          <div className={styles.controlGroup}>
            <label className={styles.label}>Day</label>
            <select
              className={styles.select}
              value={selectedSummary?.date ?? ''}
              onChange={(e) => setSelectedDate(e.target.value || null)}
            >
              {snapshot?.days.map((day) => (
                <option key={day.date} value={day.date}>
                  {formatDay(day.date)}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.controlGroup}>
            <label className={styles.label}>Daily Token Budget (0 disables)</label>
            <input
              className={styles.input}
              type="number"
              min={0}
              step={1}
              value={tokenBudgetInput}
              onChange={(e) => setTokenBudgetInput(e.target.value)}
              placeholder="e.g. 250000"
            />
          </div>

          <div className={styles.controlGroup}>
            <label className={styles.label}>Daily Cost Budget USD (0 disables)</label>
            <input
              className={styles.input}
              type="number"
              min={0}
              step={0.01}
              value={costBudgetInput}
              onChange={(e) => setCostBudgetInput(e.target.value)}
              placeholder="e.g. 25"
            />
          </div>

          <div className={styles.controlGroup}>
            <label className={styles.label}>Warning Threshold (%)</label>
            <input
              className={styles.input}
              type="number"
              min={1}
              max={99}
              step={1}
              value={warningThresholdInput}
              onChange={(e) => setWarningThresholdInput(e.target.value)}
            />
          </div>

          <div className={styles.actionRow}>
            <button className={styles.refreshBtn} type="button" onClick={() => void refresh()}>
              Refresh
            </button>
            <button
              className={styles.saveBtn}
              type="button"
              onClick={() => void handleSaveBudgets()}
              disabled={isSaving}
            >
              {isSaving ? 'Saving...' : 'Save Budgets'}
            </button>
          </div>
        </div>

        {isLoading ? (
          <div className={styles.loading}>Loading usage data...</div>
        ) : selectedSummary ? (
          <>
            <div className={styles.summaryGrid}>
              <SummaryCard label="Total Tokens" value={formatTokens(selectedSummary.tokens)} />
              <SummaryCard label="Total Cost" value={formatUsd(selectedSummary.costUsd)} />
              <SummaryCard
                label="Token Budget"
                value={
                  budget?.dailyTokenBudget
                    ? `${Math.round(budget.tokenUsagePct ?? 0)}%`
                    : 'Disabled'
                }
                tone={budget?.tokenBudgetExceeded ? 'danger' : budget?.tokenWarningReached ? 'warn' : 'default'}
              />
              <SummaryCard
                label="Cost Budget"
                value={
                  budget?.dailyCostBudgetUsd
                    ? `${Math.round(budget.costUsagePct ?? 0)}%`
                    : 'Disabled'
                }
                tone={budget?.costBudgetExceeded ? 'danger' : budget?.costWarningReached ? 'warn' : 'default'}
              />
            </div>

            <section className={styles.trendSection}>
              <div className={styles.trendHeader}>
                <div>
                  <h3>Burn Rate Trend</h3>
                  <p>
                    {trendMetric === 'tokens' ? 'Tokens' : 'Cost'} over the last {trendWindow} days
                  </p>
                </div>

                <div className={styles.trendControls}>
                  <div className={styles.segmented}>
                    <button
                      className={`${styles.segmentBtn} ${trendMetric === 'tokens' ? styles.segmentBtnActive : ''}`}
                      type="button"
                      onClick={() => setTrendMetric('tokens')}
                    >
                      Tokens
                    </button>
                    <button
                      className={`${styles.segmentBtn} ${trendMetric === 'cost' ? styles.segmentBtnActive : ''}`}
                      type="button"
                      onClick={() => setTrendMetric('cost')}
                    >
                      Cost
                    </button>
                  </div>

                  <div className={styles.segmented}>
                    {TREND_WINDOWS.map((windowSize) => (
                      <button
                        key={windowSize}
                        className={`${styles.segmentBtn} ${trendWindow === windowSize ? styles.segmentBtnActive : ''}`}
                        type="button"
                        onClick={() => setTrendWindow(windowSize)}
                      >
                        {windowSize}d
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <TrendChart
                series={trendSeries}
                metric={trendMetric}
                total={trendTotal}
                avgPerDay={trendAvgPerDay}
                projected30={trendProjected30}
                activeDays={trendActiveDays}
                windowDays={trendWindow}
              />
            </section>

            <div className={styles.tables}>
              <section className={styles.tableSection}>
                <div className={styles.tableHeader}>
                  <h3>Projects</h3>
                  <span>{selectedSummary.projects.length}</span>
                </div>
                <div className={styles.tableWrap}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>Project</th>
                        <th>Agents</th>
                        <th>Tokens</th>
                        <th>Cost</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedSummary.projects.map((project) => (
                        <tr key={project.projectDir}>
                          <td>{project.projectName}</td>
                          <td>{project.agentCount}</td>
                          <td>{formatTokens(project.tokens)}</td>
                          <td>{formatUsd(project.costUsd)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              <section className={styles.tableSection}>
                <div className={styles.tableHeader}>
                  <h3>Agents</h3>
                  <span>{selectedSummary.agents.length}</span>
                </div>
                <div className={styles.tableWrap}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>Agent</th>
                        <th>Provider</th>
                        <th>Tokens</th>
                        <th>Cost</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedSummary.agents.map((agent) => (
                        <tr key={`${agent.agentId}-${agent.updatedAt}`}>
                          <td>{agent.agentName}</td>
                          <td>{agent.provider === 'codex' ? 'Codex' : 'Claude'}</td>
                          <td>{formatTokens(agent.tokens)}</td>
                          <td>{formatUsd(agent.costUsd)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </div>
          </>
        ) : (
          <div className={styles.empty}>
            No usage data yet. Start an agent and run prompts to populate the dashboard.
          </div>
        )}
      </div>
    </div>
  )
}

function SummaryCard({
  label,
  value,
  tone = 'default'
}: {
  label: string
  value: string
  tone?: 'default' | 'warn' | 'danger'
}) {
  return (
    <div className={`${styles.summaryCard} ${tone === 'warn' ? styles.summaryWarn : ''} ${tone === 'danger' ? styles.summaryDanger : ''}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function TrendChart({
  series,
  metric,
  total,
  avgPerDay,
  projected30,
  activeDays,
  windowDays
}: {
  series: TrendPoint[]
  metric: TrendMetric
  total: number
  avgPerDay: number
  projected30: number
  activeDays: number
  windowDays: TrendWindow
}) {
  const width = 920
  const height = 220
  const paddingX = 20
  const paddingTop = 16
  const paddingBottom = 30
  const plotWidth = width - paddingX * 2
  const plotHeight = height - paddingTop - paddingBottom
  const baselineY = paddingTop + plotHeight
  const maxValue = Math.max(...series.map((point) => point.value), 0)
  const safeMax = maxValue > 0 ? maxValue : 1
  const tickStep = series.length > 14 ? 4 : series.length > 8 ? 2 : 1

  const points = series.map((point, index) => {
    const ratio = point.value / safeMax
    const x = paddingX + (series.length <= 1 ? 0 : (index * plotWidth) / (series.length - 1))
    const y = baselineY - ratio * plotHeight
    return { x, y, ...point }
  })

  const linePath = points
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
    .join(' ')
  const areaPath = points.length
    ? `${linePath} L ${points[points.length - 1].x.toFixed(2)} ${baselineY.toFixed(2)} L ${points[0].x.toFixed(2)} ${baselineY.toFixed(2)} Z`
    : ''

  return (
    <div className={styles.trendBody}>
      <div className={styles.chartWrap}>
        <svg className={styles.chartSvg} viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Usage trend chart">
          {[0.25, 0.5, 0.75, 1].map((ratio) => {
            const y = baselineY - plotHeight * ratio
            return (
              <line
                key={ratio}
                x1={paddingX}
                y1={y}
                x2={width - paddingX}
                y2={y}
                className={styles.chartGridLine}
              />
            )
          })}

          {areaPath && <path d={areaPath} className={styles.chartArea} />}
          {linePath && <path d={linePath} className={styles.chartLine} />}

          {points.length <= 14 &&
            points.map((point) => (
              <circle key={point.date} cx={point.x} cy={point.y} r={2.8} className={styles.chartPoint} />
            ))}

          {points.map((point, index) => {
            if (index !== 0 && index !== points.length - 1 && index % tickStep !== 0) return null
            return (
              <text key={`${point.date}-label`} x={point.x} y={height - 8} className={styles.chartLabel}>
                {point.label}
              </text>
            )
          })}
        </svg>
      </div>

      <div className={styles.trendStats}>
        <div className={styles.trendStatCard}>
          <span>Total ({windowDays}d)</span>
          <strong>{formatMetricValue(metric, total)}</strong>
        </div>
        <div className={styles.trendStatCard}>
          <span>Avg / day</span>
          <strong>{formatMetricValue(metric, avgPerDay)}</strong>
        </div>
        <div className={styles.trendStatCard}>
          <span>Projected 30d</span>
          <strong>{formatMetricValue(metric, projected30)}</strong>
        </div>
        <div className={styles.trendStatCard}>
          <span>Active days</span>
          <strong>
            {activeDays} / {windowDays}
          </strong>
        </div>
      </div>
    </div>
  )
}

const tokenFormatter = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 })

function formatTokens(value: number): string {
  return tokenFormatter.format(Math.round(value))
}

function formatUsd(value: number): string {
  return `$${value.toFixed(2)}`
}

function formatDay(date: string): string {
  const parsed = new Date(`${date}T00:00:00`)
  return parsed.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  })
}

function formatMetricValue(metric: TrendMetric, value: number): string {
  if (metric === 'tokens') {
    return `${formatTokens(value)}`
  }
  return formatUsd(value)
}

function buildTrendSeries(
  days: UsageDailySummary[],
  windowDays: TrendWindow,
  metric: TrendMetric
): TrendPoint[] {
  const byDate = new Map(days.map((day) => [day.date, day]))
  const result: TrendPoint[] = []
  const endDate = new Date()

  for (let index = windowDays - 1; index >= 0; index -= 1) {
    const date = addDays(endDate, -index)
    const key = toDateKey(date)
    const summary = byDate.get(key)
    const tokens = summary?.tokens ?? 0
    const costUsd = summary?.costUsd ?? 0
    const value = metric === 'tokens' ? tokens : costUsd
    result.push({
      date: key,
      label: formatDayShort(key),
      tokens,
      costUsd,
      value
    })
  }

  return result
}

function addDays(date: Date, deltaDays: number): Date {
  const next = new Date(date)
  next.setDate(next.getDate() + deltaDays)
  return next
}

function toDateKey(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function formatDayShort(dateKey: string): string {
  const date = new Date(`${dateKey}T00:00:00`)
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric'
  })
}
