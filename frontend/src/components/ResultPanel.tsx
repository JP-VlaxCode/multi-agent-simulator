import React from 'react'

interface Props {
  result: string | null
  loading: boolean
  error: string | null
}

export function ResultPanel({ result, loading, error }: Props) {
  if (!loading && !result && !error) return null

  return (
    <div className="result-panel">
      <div className="result-header">
        <span className="result-label">Response</span>
        {result && !loading && <span className="result-ok-dot" />}
      </div>

      {loading && (
        <div className="result-loading">
          <span>Processing</span>
          <div className="result-loading-bar" />
        </div>
      )}

      {!loading && error && (
        <div className="result-error">✗ {error}</div>
      )}

      {!loading && result && (
        <div className="result-body">{result}</div>
      )}
    </div>
  )
}
