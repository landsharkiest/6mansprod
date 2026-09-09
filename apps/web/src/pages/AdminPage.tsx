import { useCallback, useEffect, useState } from 'react';
import { RANKS, REPORT_REASON_LABELS, type AdminClip, type AdminReport, type ClipStatus, type Rank } from '@6mansdle/shared';
import { api } from '../api/client';

const CLIP_TABS: ClipStatus[] = ['pending', 'approved', 'rejected'];
type Section = 'clips' | 'reports';

export function AdminPage() {
  const [section, setSection] = useState<Section>('clips');

  return (
    <div className="page container">
      <h1 className="page-title">Review queue</h1>
      <p className="page-subtitle">Confirm the rank is right and the clip is fair before approving.</p>

      <div className="tabs" role="tablist">
        <button role="tab" className={`tab ${section === 'clips' ? 'active' : ''}`} onClick={() => setSection('clips')}>
          Clips
        </button>
        <button role="tab" className={`tab ${section === 'reports' ? 'active' : ''}`} onClick={() => setSection('reports')}>
          Reports
        </button>
      </div>

      {section === 'clips' ? <ClipsSection /> : <ReportsSection />}
    </div>
  );
}

function ClipsSection() {
  const [status, setStatus] = useState<ClipStatus>('pending');
  const [clips, setClips] = useState<AdminClip[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    setClips(null);
    api.adminClips(status).then(setClips).catch(() => setClips([]));
  }, [status]);

  useEffect(load, [load]);

  const review = async (clip: AdminClip, verdict: 'approved' | 'rejected', rank?: Rank) => {
    setBusy(clip.id);
    try {
      await api.reviewClip(clip.id, verdict, rank);
      setClips((cs) => cs?.filter((c) => c.id !== clip.id) ?? null);
    } finally {
      setBusy(null);
    }
  };

  const remove = async (clip: AdminClip) => {
    if (!window.confirm('Permanently delete this rejected clip and its file?')) return;
    setBusy(clip.id);
    try {
      await api.deleteClip(clip.id);
      setClips((cs) => cs?.filter((c) => c.id !== clip.id) ?? null);
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <div className="tabs" role="tablist">
        {CLIP_TABS.map((t) => (
          <button key={t} role="tab" className={`tab ${status === t ? 'active' : ''}`} onClick={() => setStatus(t)}>
            {t[0]!.toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {!clips ? (
        <div className="spinner" />
      ) : clips.length === 0 ? (
        <p className="center muted">Nothing {status} right now.</p>
      ) : (
        <div className="review-grid">
          {clips.map((clip) => (
            <ReviewCard key={clip.id} clip={clip} busy={busy === clip.id} onReview={review} onDelete={remove} />
          ))}
        </div>
      )}
    </>
  );
}

function ReviewCard({
  clip,
  busy,
  onReview,
  onDelete,
}: {
  clip: AdminClip;
  busy: boolean;
  onReview: (clip: AdminClip, verdict: 'approved' | 'rejected', rank?: Rank) => Promise<void>;
  onDelete: (clip: AdminClip) => Promise<void>;
}) {
  const [rank, setRank] = useState<Rank>(clip.rank);
  const rankChanged = rank !== clip.rank;

  return (
    <div className="card review-card">
      <video src={clip.videoUrl} controls preload="metadata" />
      <div className="review-meta">
        <div style={{ color: '#fff', fontWeight: 600, whiteSpace: 'normal', wordBreak: 'break-all' }}>
          {clip.originalFilename} {clip.hidden && <span className="hidden-badge">Hidden</span>}
        </div>
        <div>
          {clip.uploader?.username ?? 'unknown'} · {(clip.sizeBytes / 1024 / 1024).toFixed(1)} MB ·{' '}
          {new Date(clip.createdAt).toLocaleDateString()}
        </div>
        <div>
          Submitted as <span className="pill">{clip.rank}</span>
        </div>
      </div>
      <div className="review-actions">
        {clip.status !== 'approved' && (
          <>
            <select value={rank} onChange={(e) => setRank(e.target.value as Rank)} aria-label="Rank" style={{ padding: '8px 10px' }}>
              {RANKS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
            <button className="btn btn-green" disabled={busy} onClick={() => void onReview(clip, 'approved', rankChanged ? rank : undefined)}>
              Approve{rankChanged ? ` as ${rank}` : ''}
            </button>
          </>
        )}
        {clip.status !== 'rejected' && (
          <button className="btn btn-danger" disabled={busy} onClick={() => void onReview(clip, 'rejected')}>
            Reject
          </button>
        )}
        {clip.status === 'rejected' && (
          <button className="btn btn-danger" disabled={busy} onClick={() => void onDelete(clip)}>
            Delete permanently
          </button>
        )}
      </div>
    </div>
  );
}

function ReportsSection() {
  const [reports, setReports] = useState<AdminReport[] | null>(null);
  const [busy, setBusy] = useState<number | null>(null);

  const load = useCallback(() => {
    setReports(null);
    api.adminReports('open').then(setReports).catch(() => setReports([]));
  }, []);

  useEffect(load, [load]);

  const resolve = async (report: AdminReport, action: 'fix_rank' | 'reject_clip' | 'dismiss', rank?: Rank) => {
    setBusy(report.id);
    try {
      const { clipId } = await api.resolveReport(report.id, action, rank);
      // Resolving closes every open report on the clip, so drop them all from the list.
      setReports((rs) => rs?.filter((r) => r.clip.id !== clipId) ?? null);
    } finally {
      setBusy(null);
    }
  };

  if (!reports) return <div className="spinner" />;
  if (reports.length === 0) return <p className="center muted">No open reports right now.</p>;

  return (
    <div className="review-grid">
      {reports.map((report) => (
        <ReportCard key={report.id} report={report} busy={busy === report.id} onResolve={resolve} />
      ))}
    </div>
  );
}

function ReportCard({
  report,
  busy,
  onResolve,
}: {
  report: AdminReport;
  busy: boolean;
  onResolve: (report: AdminReport, action: 'fix_rank' | 'reject_clip' | 'dismiss', rank?: Rank) => Promise<void>;
}) {
  const [rank, setRank] = useState<Rank>(report.suggestedRank ?? report.clip.rank);

  return (
    <div className="card review-card">
      <video src={report.clip.videoUrl} controls preload="metadata" />
      <div className="review-meta">
        <div style={{ color: '#fff', fontWeight: 600 }}>
          {REPORT_REASON_LABELS[report.reason]} {report.clip.hidden && <span className="hidden-badge">Hidden</span>}
        </div>
        <div>
          Reported by {report.reporter?.username ?? 'unknown'} · {new Date(report.createdAt).toLocaleDateString()}
        </div>
        <div>
          Currently <span className="pill">{report.clip.rank}</span>
          {report.suggestedRank && (
            <>
              {' '}
              · suggested <span className="pill">{report.suggestedRank}</span>
            </>
          )}
        </div>
        {report.note && <div style={{ marginTop: 6 }}>&ldquo;{report.note}&rdquo;</div>}
      </div>
      <div className="review-actions">
        <select value={rank} onChange={(e) => setRank(e.target.value as Rank)} aria-label="Rank" style={{ padding: '8px 10px' }}>
          {RANKS.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
        <button className="btn btn-green" disabled={busy} onClick={() => void onResolve(report, 'fix_rank', rank)}>
          Fix rank
        </button>
        <button className="btn btn-danger" disabled={busy} onClick={() => void onResolve(report, 'reject_clip')}>
          Reject clip
        </button>
        <button className="btn btn-ghost" disabled={busy} onClick={() => void onResolve(report, 'dismiss')}>
          Dismiss
        </button>
      </div>
    </div>
  );
}
