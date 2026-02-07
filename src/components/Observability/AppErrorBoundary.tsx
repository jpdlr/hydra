import { Component, type ErrorInfo, type ReactNode } from 'react'
import { createTraceId, logEvent } from '@/lib/observability'
import styles from './AppErrorBoundary.module.css'

interface AppErrorBoundaryProps {
  children: ReactNode
}

interface AppErrorBoundaryState {
  hasError: boolean
  traceId: string
}

export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  constructor(props: AppErrorBoundaryProps) {
    super(props)
    this.state = {
      hasError: false,
      traceId: ''
    }
  }

  static getDerivedStateFromError(): Partial<AppErrorBoundaryState> {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    const traceId = createTraceId('react')
    this.setState({ traceId })
    logEvent({
      level: 'error',
      event: 'renderer.react-error-boundary',
      message: error.message,
      traceId,
      meta: {
        stack: error.stack,
        componentStack: info.componentStack
      }
    })
  }

  render(): ReactNode {
    if (!this.state.hasError) {
      return this.props.children
    }

    return (
      <div className={styles.fallback}>
        <h1>Hydra hit an unexpected error.</h1>
        <p>
          Diagnostics can be exported from settings after reload. Trace ID:{' '}
          <code>{this.state.traceId || 'n/a'}</code>
        </p>
        <button className={styles.reloadBtn} onClick={() => window.location.reload()}>
          Reload App
        </button>
      </div>
    )
  }
}
