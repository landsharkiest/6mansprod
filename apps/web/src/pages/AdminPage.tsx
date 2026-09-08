import { useCallback, useEffect, useState } from 'react';
import { RANKS, type AdminClip, type ClipStatus, type Rank } from '@6mansdle/shared';
import { api } from '../api/client';

const TABS: ClipStatus[] = ['pending', 'approved', 'rejected'];

export function AdminPage() {
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
    <div className="page container">
      <h1 className="page-title">Review queue</h1>
      <p className="page-subtitle">Confirm the rank is right and the clip is fair before approving.</p>

      <div className="tabs" role="tablist">
        {TABS.map((t) => (
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
    </div>
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
        <div style={{ color: '#fff', fontWeight: 600, whiteSpace: 'normal', wordBreak: 'break-all' }}>{clip.originalFilename}</div>
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
