import { useCallback, useEffect, useState } from 'react';
import {
  RANKS,
  REPORT_REASON_LABELS,
  type AdminClip,
  type AdminDashboard,
  type AdminReport,
  type ClipStatus,
  type Rank,
} from '@6mansdle/shared';
import { api } from '../api/client';
import { isTypingTarget, rankForKey } from '../lib/shortcuts';
import { AdminDashboardView } from '../components/AdminDashboardView';

const CLIP_TABS: ClipStatus[] = ['pending', 'approved', 'rejected'];
type Section = 'dashboard' | 'clips' | 'reports';

export function AdminPage() {
  const [section, setSection] = useState<Section>('clips');

  return (
    <div className="page container">
      <h1 className="page-title">Admin</h1>
      <p className="page-subtitle">Confirm the rank is right and the clip is fair before approving.</p>

      <div className="tabs" role="tablist">
        <button role="tab" className={`tab ${section === 'dashboard' ? 'active' : ''}`} onClick={() => setSection('dashboard')}>
          Dashboard
        </button>
        <button role="tab" className={`tab ${section === 'clips' ? 'active' : ''}`} onClick={() => setSection('clips')}>
          Clips
        </button>
        <button role="tab" className={`tab ${section === 'reports' ? 'active' : ''}`} onClick={() => setSection('reports')}>
          Reports
        </button>
      </div>

      {section === 'dashboard' ? <DashboardSection /> : section === 'clips' ? <ClipsSection /> : <ReportsSection />}
    </div>
  );
}

function DashboardSection() {
  const [data, setData] = useState<AdminDashboard | null>(null);
  const [error, setError] = useState(false);

  const load = useCallback(() => {
    api.adminDashboard().then(setData).catch(() => setError(true));
  }, []);

  useEffect(load, [load]);

  const fixRank = async (id: string, rank: Rank) => {
    await api.patchClip(id, { rank });
    load();
  };

  const toggleHidden = async (id: string, hidden: boolean) => {
    await api.patchClip(id, { hidden });
    load();
  };

  if (error) return <div className="notice error">Could not load the dashboard.</div>;
  if (!data) return <div className="spinner" />;

  return <AdminDashboardView data={data} onFixRank={(id, rank) => void fixRank(id, rank)} onToggleHidden={(id, hidden) => void toggleHidden(id, hidden)} />;
}

function ClipsSection() {
  const [status, setStatus] = useState<ClipStatus>('pending');
  const [clips, setClips] = useState<AdminClip[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [ranks, setRanks] = useState<Record<string, Rank>>({});
  const [approvingAll, setApprovingAll] = useState(false);

  const load = useCallback(() => {
    setClips(null);
    api
      .adminClips(status)
      .then((cs) => {
        setClips(cs);
        setRanks(Object.fromEntries(cs.map((c) => [c.id, c.rank])));
        setActiveIndex(0);
      })
      .catch(() => setClips([]));
  }, [status]);

  useEffect(load, [load]);

  const review = useCallback(
    async (clip: AdminClip, verdict: 'approved' | 'rejected', rank?: Rank) => {
      setBusy(clip.id);
      try {
        await api.reviewClip(clip.id, verdict, rank);
        setClips((cs) => cs?.filter((c) => c.id !== clip.id) ?? null);
      } finally {
        setBusy(null);
      }
    },
    [],
  );

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

  const approveAll = async () => {
    if (!clips || clips.length === 0) return;
    if (!window.confirm(`Approve all ${clips.length} pending clips as submitted?`)) return;
    setApprovingAll(true);
    try {
      for (const clip of clips) {
        await api.reviewClip(clip.id, 'approved');
      }
      load();
    } finally {
      setApprovingAll(false);
    }
  };

  // Keyboard shortcuts: J/K move the focused card, A approves it, R rejects it, and 1-9 set its
  // rank -- lets a reviewer clear the queue without touching the mouse.
  useEffect(() => {
    if (!clips || clips.length === 0) return;
    const handler = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;
      const clip = clips[activeIndex];
      if (!clip) return;

      if (e.key === 'j' || e.key === 'J') {
        e.preventDefault();
        setActiveIndex((i) => Math.min(i + 1, clips.length - 1));
      } else if (e.key === 'k' || e.key === 'K') {
        e.preventDefault();
        setActiveIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === 'a' || e.key === 'A') {
        e.preventDefault();
        const rank = ranks[clip.id];
        void review(clip, 'approved', rank !== clip.rank ? rank : undefined);
      } else if (e.key === 'r' || e.key === 'R') {
        e.preventDefault();
        void review(clip, 'rejected');
      } else {
        const rank = rankForKey(e.key);
        if (rank) {
          e.preventDefault();
          setRanks((rs) => ({ ...rs, [clip.id]: rank }));
        }
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [clips, activeIndex, ranks, review]);

  return (
    <>
      <div className="tabs" role="tablist">
        {CLIP_TABS.map((t) => (
          <button key={t} role="tab" className={`tab ${status === t ? 'active' : ''}`} onClick={() => setStatus(t)}>
            {t[0]!.toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {status === 'pending' && clips && clips.length > 0 && (
        <div className="center" style={{ marginBottom: 16 }}>
          <button className="btn btn-green" disabled={approvingAll} onClick={() => void approveAll()}>
            {approvingAll ? 'Approving…' : `Approve all ${clips.length} as submitted`}
          </button>
        </div>
      )}

      <p className="muted center" style={{ fontSize: '0.8rem', marginBottom: 12 }}>
        Shortcuts: J/K move · A approve · R reject · 1-9 set rank
      </p>

      {!clips ? (
        <div className="spinner" />
      ) : clips.length === 0 ? (
        <p className="center muted">Nothing {status} right now.</p>
      ) : (
        <div className="review-grid">
          {clips.map((clip, i) => (
            <ReviewCard
              key={clip.id}
              clip={clip}
              busy={busy === clip.id}
              active={i === activeIndex}
              rank={ranks[clip.id] ?? clip.rank}
              onFocus={() => setActiveIndex(i)}
              onRankChange={(rank) => setRanks((rs) => ({ ...rs, [clip.id]: rank }))}
              onReview={review}
              onDelete={remove}
            />
          ))}
        </div>
      )}
    </>
  );
}

function ReviewCard({
  clip,
  busy,
  active,
  rank,
  onFocus,
  onRankChange,
  onReview,
  onDelete,
}: {
  clip: AdminClip;
  busy: boolean;
  active: boolean;
  rank: Rank;
  onFocus: () => void;
  onRankChange: (rank: Rank) => void;
  onReview: (clip: AdminClip, verdict: 'approved' | 'rejected', rank?: Rank) => Promise<void>;
  onDelete: (clip: AdminClip) => Promise<void>;
}) {
  const rankChanged = rank !== clip.rank;
  const stats = clip.uploaderStats;
  const spammy = !!stats && stats.rejected > stats.approved && stats.rejected >= 2;

  return (
    <div className={`card review-card ${active ? 'active' : ''}`} onClick={onFocus} tabIndex={-1}>
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
        {stats && (
          <div className={spammy ? 'uploader-stats warn' : 'uploader-stats'}>
            Uploader: {stats.approved} approved / {stats.rejected} rejected
          </div>
        )}
      </div>
      <div className="review-actions">
        {clip.status !== 'approved' && (
          <>
            <select value={rank} onChange={(e) => onRankChange(e.target.value as Rank)} aria-label="Rank" style={{ padding: '8px 10px' }}>
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
