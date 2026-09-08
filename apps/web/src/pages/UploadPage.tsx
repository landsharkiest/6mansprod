import { useCallback, useEffect, useRef, useState, type DragEvent } from 'react';
import { RANKS, type Rank } from '@6mansdle/shared';
import { api, ApiRequestError, uploadToS3 } from '../api/client';

const ACCEPT = ['video/mp4', 'video/webm', 'video/quicktime'];
const MAX_MB = 50;

type Mine = Awaited<ReturnType<typeof api.myUploads>>;

export function UploadPage() {
  const [file, setFile] = useState<File | null>(null);
  const [rank, setRank] = useState<Rank>('S');
  const [dragging, setDragging] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [mine, setMine] = useState<Mine>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  const refreshMine = useCallback(() => api.myUploads().then(setMine).catch(() => undefined), []);
  useEffect(() => {
    void refreshMine();
  }, [refreshMine]);

  const choose = (f: File | undefined) => {
    setMessage(null);
    if (!f) return;
    if (!ACCEPT.includes(f.type)) return setMessage({ kind: 'error', text: 'Only MP4, WebM or MOV clips are accepted.' });
    if (f.size > MAX_MB * 1024 * 1024) return setMessage({ kind: 'error', text: `Clips must be under ${MAX_MB} MB.` });
    setFile(f);
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    choose(e.dataTransfer.files[0]);
  };

  const submit = async () => {
    if (!file) return;
    setProgress(0);
    setMessage(null);
    try {
      const { clipId, uploadUrl, headers } = await api.presignUpload({
        filename: file.name,
        contentType: file.type,
        sizeBytes: file.size,
        rank,
      });
      await uploadToS3(uploadUrl, headers, file, setProgress);
      await api.completeUpload(clipId);
      setMessage({ kind: 'ok', text: 'Uploaded. A reviewer will check the rank before it goes live.' });
      setFile(null);
      if (inputRef.current) inputRef.current.value = '';
      void refreshMine();
    } catch (err) {
      setMessage({ kind: 'error', text: err instanceof ApiRequestError ? err.message : (err as Error).message });
    } finally {
      setProgress(null);
    }
  };

  return (
    <div className="page container">
      <h1 className="page-title">Upload a clip</h1>
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
          <input ref={inputRef} type="file" accept={ACCEPT.join(',')} hidden onChange={(e) => choose(e.target.files?.[0])} />
          {file ? (
            <>
              <strong style={{ color: '#fff' }}>{file.name}</strong>
              <div className="muted" style={{ fontSize: '0.85rem' }}>
                {(file.size / 1024 / 1024).toFixed(1)} MB
              </div>
            </>
          ) : (
            <>
              <strong>Drop a clip here</strong> or click to browse
              <div style={{ fontSize: '0.85rem', marginTop: 4 }}>MP4, WebM or MOV, up to {MAX_MB} MB</div>
            </>
          )}
        </div>

        <div className="field" style={{ marginTop: 20 }}>
          <label htmlFor="rank">Rank of the player in the clip</label>
          <select id="rank" value={rank} onChange={(e) => setRank(e.target.value as Rank)}>
            {RANKS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>

        {progress !== null && (
          <div className="progress" style={{ marginBottom: 16 }}>
            <div style={{ width: `${progress}%` }} />
          </div>
        )}
        {message && <div className={`notice ${message.kind === 'error' ? 'error' : ''}`} style={{ marginBottom: 16 }}>{message.text}</div>}

        <button className="btn btn-blurple btn-lg" style={{ width: '100%' }} disabled={!file || progress !== null} onClick={() => void submit()}>
          {progress !== null ? `Uploading ${progress}%` : 'Submit for review'}
        </button>
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
