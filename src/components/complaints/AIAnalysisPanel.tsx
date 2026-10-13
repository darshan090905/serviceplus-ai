import { useState } from 'react'
import { Sparkles, Loader2, AlertTriangle } from 'lucide-react'
import type { AIComplaintAnalysis, Complaint } from '../../types'
import { analyzeComplaint } from '../../services/aiService'
import { useToast } from '../ui/Toast'
import { useAppStore } from '../../store/AppStore'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'

export function AIAnalysisPanel({ complaint }: { complaint: Complaint }) {
  const { updateComplaint } = useAppStore()
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)
  const [analysis, setAnalysis] = useState<AIComplaintAnalysis | null>(complaint.analysis ?? null)

  const run = async () => {
    setLoading(true)
    setError(false)
    try {
      const result = await analyzeComplaint({ description: complaint.description, category: complaint.category })
      setAnalysis(result)
      updateComplaint(complaint.id, { analysis: result })
      toast('AI analysis completed.', 'info')
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }

  const items: Array<{ label: string; value: string; tone?: 'danger' | 'warning' | 'success' | 'neutral' | 'info' | 'brand' }> = analysis
    ? [
        { label: 'Category', value: analysis.category },
        { label: 'Severity', value: analysis.severity, tone: analysis.severity === 'High' || analysis.severity === 'Critical' ? 'danger' : 'warning' },
        { label: 'Sentiment', value: analysis.sentiment, tone: analysis.sentiment === 'Negative' ? 'danger' : 'success' },
        { label: 'Repeated Issue', value: analysis.repeatedIssue ? 'Yes' : 'No', tone: analysis.repeatedIssue ? 'danger' : 'success' },
        { label: 'Customer Frustration', value: analysis.frustration, tone: analysis.frustration === 'High' ? 'danger' : 'warning' },
      ]
    : []

  return (
    <div className="rounded-xl border border-brand-100 bg-gradient-to-b from-brand-50/60 to-white p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-brand-600" aria-hidden />
          <h3 className="text-sm font-semibold text-slate-900">AI-Assisted Analysis</h3>
        </div>
        {!analysis && (
          <Button size="sm" variant="outline" onClick={run} loading={loading} icon={<Sparkles className="h-3.5 w-3.5" />}>
            Analyze with AI
          </Button>
        )}
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin text-brand-600" aria-hidden />
          Analyzing complaint...
        </div>
      )}

      {!loading && error && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          <p className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <span>
              AI analysis is temporarily unavailable.
              <br />
              You can continue using the standard workflow.
            </span>
          </p>
          <Button size="sm" variant="outline" className="mt-2" onClick={run}>Try Again</Button>
        </div>
      )}

      {analysis && !loading && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {items.map((item) => (
              <div key={item.label} className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                <p className="text-[11px] uppercase tracking-wide text-slate-400">{item.label}</p>
                <Badge tone={item.tone ?? 'neutral'} className="mt-1">{item.value}</Badge>
              </div>
            ))}
          </div>
          <div className="rounded-lg border border-brand-100 bg-brand-50/50 px-3 py-2.5 text-sm">
            <span className="font-medium text-brand-700">Recommendation: </span>
            <span className="text-slate-700">{analysis.recommendation}</span>
          </div>
          {analysis.repeatedIssue && (
            <p className="text-xs text-slate-400">AI-assisted. Final resolution requires human review.</p>
          )}
        </div>
      )}

      {!analysis && !loading && !error && (
        <p className="text-sm text-slate-500">Run the analysis to get an AI-assisted category, severity and recommendation for this complaint.</p>
      )}
    </div>
  )
}