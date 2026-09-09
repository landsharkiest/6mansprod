import { useState } from 'react';
import { RANKS, REPORT_REASONS, REPORT_REASON_LABELS, type Rank, type ReportReason } from '@6mansdle/shared';
import { api, ApiRequestError } from '../api/client';

interface Props {
  clipId: string;
}

type Phase = 'link' | 'form' | 'sent' | 'already-sent';

/** Inline "Report clip" link + form shown under the reveal, for signed-in users only. */
export function ReportClipForm({ clipId }: Props) {
  const [phase, setPhase] = useState<Phase>('link');
  const [reason, setReason] = useState<ReportReason>('wrong_rank');
  const [suggestedRank, setSuggestedRank] = useState<Rank>(RANKS[0]);
  const [note, setNote] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setPending(true);
    setError(null);
    try {
      await api.reportClip(clipId, {
        reason,
        ...(reason === 'wrong_rank' ? { suggestedRank } : {}),
        ...(note.trim() ? { note: note.trim() } : {}),
      });
      setPhase('sent');
    } catch (err) {
      if (err instanceof ApiRequestError && err.status === 409) {
        setPhase('already-sent');
      } else {
        setError(err instanceof ApiRequestError ? err.message : 'Could not send the report');
      }
    } finally {
      setPending(false);
    }
  };

  if (phase === 'sent') return <p className="muted center report-status">Thanks, reported.</p>;
  if (phase === 'already-sent') return <p className="muted center report-status">You already reported this clip.</p>;

  if (phase === 'link') {
    return (
      <button type="button" className="link-btn" onClick={() => setPhase('form')}>
        Report clip
      </button>
    );
  }

  return (
    <div className="card report-form">
      <div className="card-title">Report this clip</div>
      <div className="field">
        <label htmlFor="report-reason">Reason</label>
        <select id="report-reason" value={reason} onChange={(e) => setReason(e.target.value as ReportReason)}>
          {REPORT_REASONS.map((r) => (
            <option key={r} value={r}>
              {REPORT_REASON_LABELS[r]}
            </option>
          ))}
        </select>
      </div>
      {reason === 'wrong_rank' && (
        <div className="field">
          <label htmlFor="report-suggested-rank">What rank should it be?</label>
          <select id="report-suggested-rank" value={suggestedRank} onChange={(e) => setSuggestedRank(e.target.value as Rank)}>
            {RANKS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>
      )}
      <div className="field">
        <label htmlFor="report-note">Note (optional)</label>
        <textarea
          id="report-note"
          value={note}
          maxLength={300}
          rows={3}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Anything else the reviewer should know"
        />
      </div>
      {error && <div className="notice error">{error}</div>}
      <div className="review-actions">
        <button type="button" className="btn btn-danger" disabled={pending} onClick={() => void submit()}>
          Submit report
        </button>
        <button type="button" className="btn btn-ghost" disabled={pending} onClick={() => setPhase('link')}>
          Cancel
        </button>
      </div>
    </div>
  );
}
