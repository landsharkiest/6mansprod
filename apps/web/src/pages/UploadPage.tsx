import { useCallback, useEffect, useRef, useState, type DragEvent } from 'react';
import { RANKS, type Rank } from '@6mansdle/shared';
import { api, ApiRequestError, uploadToS3 } from '../api/client';
import { rankFromFilename, runQueue } from '../lib/uploadQueue';

const ACCEPT = ['video/mp4', 'video/webm', 'video/quicktime'];
const MAX_MB = 50;
const CONCURRENCY = 3;

type Mine = Awaited<ReturnType<typeof api.myUploads>>;
type RowStatus = 'queued' | 'uploading' | 'done' | 'error';

interface Row {
  id: string;
  file: File;
  rank: Rank;
  status: RowStatus;
  progress: number;
  error: string | null;
}

let nextRowId = 0;

export function UploadPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [dragging, setDragging] = useState(false);
  const [lastRank, setLastRank] = useState<Rank>('S');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [mine, setMine] = useState<Mine>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  const refreshMine = useCallback(() => api.myUploads().then(setMine).catch(() => undefined), []);
  useEffect(() => {
    void refreshMine();
  }, [refreshMine]);

  const chooseFiles = (files: FileList | File[] | null) => {
    if (!files || files.length === 0) return;
    setMessage(null);
    const rejected: string[] = [];
    const accepted: Row[] = [];
    for (const file of Array.from(files)) {
      if (!ACCEPT.includes(file.type)) {
        rejected.push(`${file.name}: only MP4, WebM or MOV clips are accepted`);
        continue;
      }
      if (file.size > MAX_MB * 1024 * 1024) {
        rejected.push(`${file.name}: over the ${MAX_MB} MB limit`);
        continue;
      }
      nextRowId += 1;
      accepted.push({
        id: `row-${nextRowId}`,
        file,
        rank: rankFromFilename(file.name) ?? lastRank,
        status: 'queued',
        progress: 0,
        error: null,
      });
    }
    if (rejected.length > 0) setMessage({ kind: 'error', text: rejected.join('; ') });
    if (accepted.length > 0) setRows((rs) => [...rs, ...accepted]);
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    chooseFiles(e.dataTransfer.files);
  };

  const setRowRank = (id: string, rank: Rank) => {
    setLastRank(rank);
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, rank } : r)));
  };

  const removeRow = (id: string) => setRows((rs) => rs.filter((r) => r.id !== id));

  const uploadOne = useCallback(async (row: Row): Promise<void> => {
    setRows((rs) => rs.map((r) => (r.id === row.id ? { ...r, status: 'uploading', progress: 0, error: null } : r)));
    try {
      const { clipId, uploadUrl, headers } = await api.presignUpload({
        filename: row.file.name,
        contentType: row.file.type,
        sizeBytes: row.file.size,
        rank: row.rank,
      });
      await uploadToS3(uploadUrl, headers, row.file, (pct) =>
        setRows((rs) => rs.map((r) => (r.id === row.id ? { ...r, progress: pct } : r))),
      );
      await api.completeUpload(clipId);
      setRows((rs) => rs.map((r) => (r.id === row.id ? { ...r, status: 'done', progress: 100 } : r)));
    } catch (err) {
      const text = err instanceof ApiRequestError ? err.message : (err as Error).message;
      setRows((rs) => rs.map((r) => (r.id === row.id ? { ...r, status: 'error', error: text } : r)));
      throw err;
    }
  }, []);

  const uploadAll = async () => {
    const pending = rows.filter((r) => r.status === 'queued' || r.status === 'error');
    if (pending.length === 0) return;
    setBusy(true);
    setMessage(null);
    try {
      await runQueue(
        pending.map((row) => ({ id: row.id, run: () => uploadOne(row) })),
        CONCURRENCY,
      );
      void refreshMine();
    } finally {
      setBusy(false);
    }
  };

  const retryRow = async (row: Row) => {
    try {
      await uploadOne(row);
      void refreshMine();
    } catch {
      // uploadOne already recorded the error on the row.
    }
  };

  const doneCount = rows.filter((r) => r.status === 'done').length;
  const hasPending = rows.some((r) => r.status === 'queued' || r.status === 'error');

  return (
    <div className="page container">
      <h1 className="page-title">Upload clips</h1>
      <p className="page-subtitle">Short 6mans gameplay, one player's perspective, no rank shown on screen.</p>

      <div className="card" style={{ maxWidth: 640, margin: '0 auto' }}>
        <div
          className={`dropzone ${dragging ? 'active' : ''}`}
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
        >
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPT.join(',')}
            multiple
            hidden
            onChange={(e) => {
              chooseFiles(e.target.files);
              e.target.value = '';
            }}
          />
          <strong>Drop clips here</strong> or click to browse
          <div style={{ fontSize: '0.85rem', marginTop: 4 }}>MP4, WebM or MOV, up to {MAX_MB} MB each. Select as many as you like.</div>
          <div style={{ fontSize: '0.78rem', marginTop: 4 }}>
            Name a file like <code>B+_clip.mp4</code> or <code>S_ranked.mp4</code> to pre-fill its rank.
          </div>
        </div>

        {message && <div className={`notice ${message.kind === 'error' ? 'error' : ''}`} style={{ marginTop: 16 }}>{message.text}</div>}

        {rows.length > 0 && (
          <>
            <ul className="upload-rows" aria-label="Files to upload" style={{ marginTop: 16 }}>
              {rows.map((row) => (
                <UploadRowItem
                  key={row.id}
                  row={row}
                  onRankChange={(rank) => setRowRank(row.id, rank)}
                  onRetry={() => void retryRow(row)}
                  onRemove={() => removeRow(row.id)}
                />
              ))}
            </ul>

            <div className="muted" style={{ fontSize: '0.85rem', margin: '12px 0' }}>
              {doneCount} of {rows.length} uploaded
            </div>

            <button className="btn btn-blurple btn-lg" style={{ width: '100%' }} disabled={busy || !hasPending} onClick={() => void uploadAll()}>
              {busy ? 'Uploading…' : `Upload ${rows.filter((r) => r.status !== 'done').length} clip${rows.length === 1 ? '' : 's'}`}
            </button>
          </>
        )}
      </div>

      {mine.length > 0 && (
        <div className="card" style={{ maxWidth: 640, margin: '20px auto 0', padding: 0 }}>
          <div className="card-title" style={{ padding: '20px 20px 0' }}>
            Your uploads
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>File</th>
                  <th>Rank</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {mine.map((c) => (
                  <tr key={c.id}>
                    <td style={{ whiteSpace: 'normal' }}>{c.originalFilename}</td>
                    <td>
                      <span className="pill">{c.rank}</span>
                    </td>
                    <td>
                      <span className={`status ${c.status}`}>{c.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function UploadRowItem({
  row,
  onRankChange,
  onRetry,
  onRemove,
}: {
  row: Row;
  onRankChange: (rank: Rank) => void;
  onRetry: () => void;
  onRemove: () => void;
}) {
  return (
    <li className="upload-row" data-status={row.status}>
      <div className="upload-row-name" title={row.file.name}>
        {row.file.name}
        <span className="muted" style={{ marginLeft: 6, fontSize: '0.8rem' }}>
          {(row.file.size / 1024 / 1024).toFixed(1)} MB
        </span>
      </div>

      <select
        aria-label={`Rank for ${row.file.name}`}
        value={row.rank}
        disabled={row.status === 'uploading' || row.status === 'done'}
        onChange={(e) => onRankChange(e.target.value as Rank)}
      >
        {RANKS.map((r) => (
          <option key={r} value={r}>
            {r}
          </option>
        ))}
      </select>

      <div className="upload-row-progress">
        {row.status === 'uploading' || row.status === 'done' ? (
          <div className="progress">
            <div style={{ width: `${row.progress}%` }} />
          </div>
        ) : row.status === 'error' ? (
          <span className="notice error" style={{ padding: '2px 8px', fontSize: '0.78rem' }}>
            {row.error}
          </span>
        ) : (
          <span className="muted" style={{ fontSize: '0.8rem' }}>
            Queued
          </span>
        )}
      </div>

      <div className="upload-row-actions">
        {row.status === 'done' && <span className="status approved">Done</span>}
        {row.status === 'error' && (
          <button className="btn btn-ghost" onClick={onRetry}>
            Retry
          </button>
        )}
        {row.status === 'queued' && (
          <button className="btn btn-ghost" onClick={onRemove} aria-label={`Remove ${row.file.name}`}>
            Remove
          </button>
        )}
      </div>
    </li>
  );
}
