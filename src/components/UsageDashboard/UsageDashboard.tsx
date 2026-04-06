import { useCallback, useEffect, useMemo, useState } from 'react'
import type { CcusageDailyEntry, CcusageSnapshot, ProviderId } from '@shared/types'
import { PROVIDER_LABELS } from '@shared/types'
import styles from './UsageDashboard.module.css'

interface UsageDashboardProps {
  onClose: () => void
}

const DAY_LIMIT = 30
const TREND_WINDOWS = [7, 30] as const
const USAGE_PROVIDERS: ProviderId[] = ['claude', 'codex', 'opencode']
type TrendWindow = (typeof TREND_WINDOWS)[number]

interface TrendPoint {
  date: string
  label: string
  cost: number
  tokens: number
}

export function UsageDashboard({ onClose }: UsageDashboardProps) {
  const [snapshot, setSnapshot] = useState<CcusageSnapshot | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [trendWindow, setTrendWindow] = useState<TrendWindow>(7)
  const [selectedProvider, setSelectedProvider] = useState<ProviderId>('claude')

  const refresh = useCallback(async () => {
    setIsLoading(true)
    try {
      const next = await window.hydra.getUsageDashboard({ days: DAY_LIMIT, provider: selectedProvider })
      const normalized = normalizeSnapshot(next)
      setSnapshot(normalized)
      setSelectedDate((prev) => {
        if (prev && normalized.daily.some((d) => d.date === prev)) return prev
        return normalized.daily[normalized.daily.length - 1]?.date ?? null
      })
    } finally {
      setIsLoading(false)
    }
  }, [selectedProvider])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const selectedDay = useMemo<CcusageDailyEntry | null>(() => {
    if (!snapshot) return null
    if (selectedDate) return snapshot.daily.find((d) => d.date === selectedDate) ?? null
    return snapshot.daily[snapshot.daily.length - 1] ?? null
  }, [snapshot, selectedDate])

  const trendSeries = useMemo<TrendPoint[]>(() => {
    return buildTrendSeries(snapshot?.daily ?? [], trendWindow)
  }, [snapshot, trendWindow])

  const trendTotalCost = useMemo(
    () => trendSeries.reduce((sum, p) => sum + p.cost, 0),
    [trendSeries]
  )
  const trendActiveDays = useMemo(
    () => trendSeries.filter((p) => p.cost > 0).length,
    [trendSeries]
  )
  const trendAvgPerDay = trendTotalCost / trendWindow
  const trendProjected30 = trendAvgPerDay * 30

  // Derive project display names from keys
  const projectEntries = useMemo(() => {
    if (!snapshot || !selectedDate) return []
    return Object.entries(snapshot.projects)
      .map(([key, entries]) => {
        const dayEntry = entries.find((e) => e.date === selectedDate)
        if (!dayEntry || dayEntry.totalCost === 0) return null
        const name = prettifyProjectKey(key)
        return { key, name, ...dayEntry }
      })
      .filter(Boolean)
      .sort((a, b) => b!.totalCost - a!.totalCost) as Array<
      CcusageDailyEntry & { key: string; name: string }
    >
  }, [snapshot, selectedDate])

  const providerName = PROVIDER_LABELS[selectedProvider]
  const subtitle = 'Token usage and costs from local agent logs via ccusage'
  const providerInstallTitle = `${providerName} usage support is not installed`
  const providerInstallDescription = `Hydra uses ccusage to analyze your local ${providerName} usage logs.`
  const providerEmptyDescription = `No usage data found. Start using ${providerName} to generate usage logs.`

  // Not installed state
  if (!isLoading && snapshot && !snapshot.available) {
    return (
      <div className={styles.overlay} onClick={onClose}>
        <div className={styles.panel} onClick={(e) => e.stopPropagation()}>
          <div className={styles.header}>
            <div>
              <h2>Usage Dashboard</h2>
              <p className={styles.subtitle}>{subtitle}</p>
            </div>
            <button className={styles.closeBtn} type="button" onClick={onClose}>
              &#x2715;
            </button>
          </div>
          <div className={styles.controls}>
            <div className={styles.controlGroup}>
              <label className={styles.label}>Provider</label>
              <div className={styles.segmented}>
                {USAGE_PROVIDERS.map((provider) => (
                  <button
                    key={provider}
                    className={`${styles.segmentBtn} ${selectedProvider === provider ? styles.segmentBtnActive : ''}`}
                    type="button"
                    onClick={() => setSelectedProvider(provider)}
                  >
                    {PROVIDER_LABELS[provider]}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className={styles.notInstalled}>
            <div className={styles.notInstalledIcon}>
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            </div>
            <h3>{providerInstallTitle}</h3>
            <p>
              {providerInstallDescription}
              {' '}No API keys required.
            </p>
            <div className={styles.installBlock}>
              <code>{snapshot.installHint?.split('\n')[1]?.trim() ?? 'npm install -g ccusage'}</code>
            </div>
            <p className={styles.installNote}>
              After installing, refresh or reopen this dashboard to see your usage data.
            </p>
            <a
              className={styles.learnMore}
              href="https://github.com/ryoppippi/ccusage"
              target="_blank"
              rel="noopener noreferrer"
            >
              Learn more about ccusage
            </a>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.panel} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <div>
            <h2>Usage Dashboard</h2>
            <p className={styles.subtitle}>{subtitle}</p>
          </div>
          <button className={styles.closeBtn} type="button" onClick={onClose}>
            &#x2715;
          </button>
        </div>

        <div className={styles.content}>
          {isLoading ? (
            <div className={styles.loading}>
              <div className={styles.spinner} />
              <span>Loading usage data...</span>
            </div>
          ) : selectedDay ? (
            <>
            <div className={styles.controls}>
              <div className={styles.controlGroup}>
                <label className={styles.label}>Provider</label>
                <div className={styles.segmented}>
                  {USAGE_PROVIDERS.map((provider) => (
                    <button
                      key={provider}
                      className={`${styles.segmentBtn} ${selectedProvider === provider ? styles.segmentBtnActive : ''}`}
                      type="button"
                      onClick={() => setSelectedProvider(provider)}
                    >
                      {PROVIDER_LABELS[provider]}
                    </button>
                  ))}
                </div>
              </div>

              <div className={styles.controlGroup}>
                <label className={styles.label}>Day</label>
                <select
                  className={styles.select}
                  value={selectedDate ?? ''}
                  onChange={(e) => setSelectedDate(e.target.value || null)}
                >
                  {snapshot?.daily.map((day) => (
                    <option key={day.date} value={day.date}>
                      {formatDay(day.date)}
                    </option>
                  ))}
                </select>
              </div>

              <div className={styles.actionRow}>
                <button className={styles.refreshBtn} type="button" onClick={() => void refresh()}>
                  Refresh
                </button>
              </div>
            </div>
              <div className={styles.summaryGrid}>
                <SummaryCard label="Total Cost" value={formatUsd(selectedDay.totalCost)} />
                <SummaryCard label="Total Tokens" value={formatTokens(selectedDay.totalTokens)} />
                <SummaryCard label="Input" value={formatTokens(selectedDay.inputTokens)} />
                <SummaryCard label="Output" value={formatTokens(selectedDay.outputTokens)} />
                <SummaryCard label="Cache Created" value={formatTokens(selectedDay.cacheCreationTokens)} />
                <SummaryCard label="Cache Read" value={formatTokens(selectedDay.cacheReadTokens)} />
              </div>

              <section className={styles.trendSection}>
                <div className={styles.trendHeader}>
                  <div>
                    <h3>Cost Trend</h3>
                    <p>Daily cost over the last {trendWindow} days</p>
                  </div>

                  <div className={styles.trendControls}>
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
                  total={trendTotalCost}
                  avgPerDay={trendAvgPerDay}
                  projected30={trendProjected30}
                  activeDays={trendActiveDays}
                  windowDays={trendWindow}
                />
              </section>

              <div className={styles.tables}>
                <section className={styles.tableSection}>
                  <div className={styles.tableHeader}>
                    <h3>Model Breakdown</h3>
                    <span>{selectedDay.modelBreakdowns.length} models</span>
                  </div>
                  <div className={styles.tableWrap}>
                    <table className={styles.table}>
                      <thead>
                        <tr>
                          <th>Model</th>
                          <th>Input</th>
                          <th>Output</th>
                          <th>Cache Write</th>
                          <th>Cache Read</th>
                          <th>Cost</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedDay.modelBreakdowns.map((model) => (
                          <tr key={model.modelName}>
                            <td>{prettifyModelName(model.modelName)}</td>
                            <td>{formatTokens(model.inputTokens)}</td>
                            <td>{formatTokens(model.outputTokens)}</td>
                            <td>{formatTokens(model.cacheCreationTokens)}</td>
                            <td>{formatTokens(model.cacheReadTokens)}</td>
                            <td>{formatUsd(model.cost)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>

                {projectEntries.length > 0 && (
                  <section className={styles.tableSection}>
                    <div className={styles.tableHeader}>
                      <h3>Projects</h3>
                      <span>{projectEntries.length} projects</span>
                    </div>
                    <div className={styles.tableWrap}>
                      <table className={styles.table}>
                        <thead>
                          <tr>
                            <th>Project</th>
                            <th>Tokens</th>
                            <th>Cost</th>
                          </tr>
                        </thead>
                        <tbody>
                          {projectEntries.map((project) => (
                            <tr key={project.key}>
                              <td>{project.name}</td>
                              <td>{formatTokens(project.totalTokens)}</td>
                              <td>{formatUsd(project.totalCost)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </section>
                )}
              </div>
            </>
          ) : (
            <div className={styles.empty}>
              {providerEmptyDescription}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function normalizeSnapshot(snapshot: CcusageSnapshot): CcusageSnapshot {
  return {
    ...snapshot,
    daily: Array.isArray(snapshot.daily) ? snapshot.daily.map(normalizeDailyEntry) : [],
    projects: Object.fromEntries(
      Object.entries(snapshot.projects ?? {}).map(([key, entries]) => [
        key,
        Array.isArray(entries) ? entries.map(normalizeDailyEntry) : []
      ])
    )
  }
}

function normalizeDailyEntry(entry: Partial<CcusageDailyEntry>): CcusageDailyEntry {
  const modelBreakdowns = Array.isArray(entry.modelBreakdowns)
    ? entry.modelBreakdowns.map((model) => {
        const looseModel = model as unknown as Record<string, unknown>
        return {
          modelName: typeof model.modelName === 'string' ? model.modelName : 'Unknown',
          inputTokens: typeof model.inputTokens === 'number' ? model.inputTokens : 0,
          outputTokens: typeof model.outputTokens === 'number' ? model.outputTokens : 0,
          cacheCreationTokens: typeof model.cacheCreationTokens === 'number' ? model.cacheCreationTokens : 0,
          cacheReadTokens: typeof model.cacheReadTokens === 'number' ? model.cacheReadTokens : 0,
          cost: readNumber(model.cost, looseModel.totalCost, looseModel.costUSD)
        }
      })
    : []

  return {
    date: normalizeDateKey(entry.date),
    inputTokens: typeof entry.inputTokens === 'number' ? entry.inputTokens : 0,
    outputTokens: typeof entry.outputTokens === 'number' ? entry.outputTokens : 0,
    cacheCreationTokens: typeof entry.cacheCreationTokens === 'number' ? entry.cacheCreationTokens : 0,
    cacheReadTokens: typeof entry.cacheReadTokens === 'number' ? entry.cacheReadTokens : 0,
    totalTokens: typeof entry.totalTokens === 'number' ? entry.totalTokens : 0,
    totalCost: readNumber(entry.totalCost, (entry as Record<string, unknown>).cost, (entry as Record<string, unknown>).costUSD),
    modelsUsed: Array.isArray(entry.modelsUsed)
      ? entry.modelsUsed.filter((model): model is string => typeof model === 'string')
      : modelBreakdowns.map((model) => model.modelName),
    modelBreakdowns
  }
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.summaryCard}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function TrendChart({
  series,
  total,
  avgPerDay,
  projected30,
  activeDays,
  windowDays
}: {
  series: TrendPoint[]
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
  const maxValue = Math.max(...series.map((p) => p.cost), 0)
  const safeMax = maxValue > 0 ? maxValue : 1
  const tickStep = series.length > 14 ? 4 : series.length > 8 ? 2 : 1

  const points = series.map((point, index) => {
    const ratio = point.cost / safeMax
    const x = paddingX + (series.length <= 1 ? 0 : (index * plotWidth) / (series.length - 1))
    const y = baselineY - ratio * plotHeight
    return { x, y, ...point }
  })

  const linePath = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`)
    .join(' ')
  const areaPath = points.length
    ? `${linePath} L ${points[points.length - 1].x.toFixed(2)} ${baselineY.toFixed(2)} L ${points[0].x.toFixed(2)} ${baselineY.toFixed(2)} Z`
    : ''

  return (
    <div className={styles.trendBody}>
      <div className={styles.chartWrap}>
        <svg
          className={styles.chartSvg}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label="Usage cost trend chart"
        >
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
              <circle
                key={point.date}
                cx={point.x}
                cy={point.y}
                r={2.8}
                className={styles.chartPoint}
              />
            ))}

          {points.map((point, index) => {
            if (index !== 0 && index !== points.length - 1 && index % tickStep !== 0) return null
            return (
              <text
                key={`${point.date}-label`}
                x={point.x}
                y={height - 8}
                className={styles.chartLabel}
              >
                {point.label}
              </text>
            )
          })}
        </svg>
      </div>

      <div className={styles.trendStats}>
        <div className={styles.trendStatCard}>
          <span>Total ({windowDays}d)</span>
          <strong>{formatUsd(total)}</strong>
        </div>
        <div className={styles.trendStatCard}>
          <span>Avg / day</span>
          <strong>{formatUsd(avgPerDay)}</strong>
        </div>
        <div className={styles.trendStatCard}>
          <span>Projected 30d</span>
          <strong>{formatUsd(projected30)}</strong>
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
const compactTokenFormatter = new Intl.NumberFormat(undefined, {
  minimumFractionDigits: 0,
  maximumFractionDigits: 1
})

function formatTokens(value: number): string {
  const rounded = Math.round(value)
  const absolute = Math.abs(rounded)

  if (absolute >= 1_000_000_000) {
    return `${formatCompactTokenNumber(rounded / 1_000_000_000)}B`
  }
  if (absolute >= 1_000_000) {
    return `${formatCompactTokenNumber(rounded / 1_000_000)}M`
  }
  if (absolute >= 1_000) {
    return `${formatCompactTokenNumber(rounded / 1_000)}K`
  }

  return tokenFormatter.format(rounded)
}

function formatCompactTokenNumber(value: number): string {
  const precision = Math.abs(value) >= 100 ? 0 : 1
  const rounded = Number(value.toFixed(precision))
  return compactTokenFormatter.format(rounded)
}

function formatUsd(value: number): string {
  return `$${value.toFixed(2)}`
}

function formatDay(date: string): string {
  const parsed = parseUsageDate(date)
  if (!parsed) return date
  return parsed.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  })
}

function buildTrendSeries(
  daily: CcusageDailyEntry[],
  windowDays: TrendWindow
): TrendPoint[] {
  const byDate = new Map(daily.map((d) => [d.date, d]))
  const result: TrendPoint[] = []
  const endDate = new Date()

  for (let i = windowDays - 1; i >= 0; i -= 1) {
    const date = addDays(endDate, -i)
    const key = toDateKey(date)
    const entry = byDate.get(key)
    result.push({
      date: key,
      label: formatDayShort(key),
      cost: entry?.totalCost ?? 0,
      tokens: entry?.totalTokens ?? 0
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
  const date = parseUsageDate(dateKey)
  if (!date) return dateKey
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric'
  })
}

function parseUsageDate(value: string): Date | null {
  if (!value) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const isoDate = new Date(`${value}T00:00:00`)
    return Number.isNaN(isoDate.getTime()) ? null : isoDate
  }

  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function normalizeDateKey(value: unknown): string {
  if (typeof value !== 'string') return ''
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value

  const parsed = parseUsageDate(value)
  return parsed ? toDateKey(parsed) : value
}

function readNumber(...values: unknown[]): number {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value)) return value
  }
  return 0
}

function prettifyProjectKey(key: string): string {
  // ccusage keys look like "-Users-jp-Documents-Personal-GitHub-Projects-hydra"
  const parts = key.split('-').filter(Boolean)
  // Return last 2 segments for brevity
  return parts.slice(-2).join('/') || key
}

function prettifyModelName(name: string): string {
  // e.g. "claude-opus-4-6" → "Opus 4.6", "claude-haiku-4-5-20251001" → "Haiku 4.5"
  if (name.startsWith('claude-')) {
    const rest = name.slice(7) // remove "claude-"
    // Extract family and version
    const match = rest.match(/^(opus|sonnet|haiku)-(\d+)-(\d+)/)
    if (match) {
      const family = match[1].charAt(0).toUpperCase() + match[1].slice(1)
      return `${family} ${match[2]}.${match[3]}`
    }
  }
  return name
}
