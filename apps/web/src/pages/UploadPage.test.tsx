import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { UploadPage } from './UploadPage';
import { api, uploadToS3 } from '../api/client';

vi.mock('../api/client', () => ({
  api: {
    myUploads: vi.fn().mockResolvedValue([]),
    presignUpload: vi.fn(),
    completeUpload: vi.fn(),
  },
  uploadToS3: vi.fn(),
  ApiRequestError: class ApiRequestError extends Error {
    constructor(
      public status: number,
      message: string,
    ) {
      super(message);
    }
  },
}));

function makeFile(name: string, type = 'video/mp4', sizeMb = 1): File {
  const file = new File([new Uint8Array(sizeMb * 1024 * 1024)], name, { type });
  return file;
}

function dropFiles(dropzone: Element, files: File[]) {
  fireEvent.drop(dropzone, { dataTransfer: { files } });
}

describe('UploadPage bulk upload', () => {
  beforeEach(() => {
    vi.mocked(api.myUploads).mockResolvedValue([]);
    vi.mocked(api.presignUpload).mockReset().mockImplementation(async ({ filename }) => ({
      clipId: `clip-${filename}`,
      uploadUrl: 'https://example.test/upload',
      headers: {},
    }));
    vi.mocked(api.completeUpload).mockReset().mockResolvedValue({ clipId: 'x' });
    vi.mocked(uploadToS3)
      .mockReset()
      .mockImplementation(async (_url, _headers, _file, onProgress) => {
        onProgress?.(100);
      });
  });

  it('lists each dropped file with its own rank select, defaulting from the filename convention', async () => {
    render(<UploadPage />);
    const dropzone = screen.getByText(/drop clips here/i).closest('div')!;

    dropFiles(dropzone, [makeFile('B+_ranked.mp4'), makeFile('plain.mp4')]);

    expect(await screen.findByText('B+_ranked.mp4')).toBeInTheDocument();
    expect(screen.getByText('plain.mp4')).toBeInTheDocument();

    const rankSelects = screen.getAllByRole('combobox') as HTMLSelectElement[];
    expect(rankSelects).toHaveLength(2);
    // Filename-derived rank pre-fills the first row.
    expect(rankSelects.find((s) => s.getAttribute('aria-label') === 'Rank for B+_ranked.mp4')?.value).toBe('B+');
  });

  it('keeps the single-file flow working: one dropped file uploads through presign -> PUT -> complete', async () => {
    render(<UploadPage />);
    const dropzone = screen.getByText(/drop clips here/i).closest('div')!;
    dropFiles(dropzone, [makeFile('S_solo.mp4')]);

    await screen.findByText('S_solo.mp4');
    fireEvent.click(screen.getByRole('button', { name: /upload 1 clip/i }));

    await waitFor(() => expect(api.completeUpload).toHaveBeenCalledWith('clip-S_solo.mp4'));
    expect(api.presignUpload).toHaveBeenCalledWith(
      expect.objectContaining({ filename: 'S_solo.mp4', rank: 'S' }),
    );
  });

  it('uploads multiple files and marks each row done', async () => {
    render(<UploadPage />);
    const dropzone = screen.getByText(/drop clips here/i).closest('div')!;
    dropFiles(dropzone, [makeFile('S_one.mp4'), makeFile('A_two.mp4'), makeFile('C_three.mp4')]);

    await screen.findByText('S_one.mp4');
    fireEvent.click(screen.getByRole('button', { name: /upload 3 clips/i }));

    await waitFor(() => expect(api.completeUpload).toHaveBeenCalledTimes(3));
    await waitFor(() => expect(screen.getByText(/3 of 3 uploaded/i)).toBeInTheDocument());
  });

  it('shows a retry button on a failed row and lets the user retry it', async () => {
    vi.mocked(api.presignUpload).mockRejectedValueOnce(new Error('network down')).mockResolvedValue({
      clipId: 'clip-retry.mp4',
      uploadUrl: 'https://example.test/upload',
      headers: {},
    });

    render(<UploadPage />);
    const dropzone = screen.getByText(/drop clips here/i).closest('div')!;
    dropFiles(dropzone, [makeFile('retry.mp4')]);

    await screen.findByText('retry.mp4');
    fireEvent.click(screen.getByRole('button', { name: /upload 1 clip/i }));

    const retryBtn = await screen.findByRole('button', { name: /retry/i });
    fireEvent.click(retryBtn);

    await waitFor(() => expect(api.completeUpload).toHaveBeenCalled());
  });
});
