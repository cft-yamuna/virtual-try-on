import { describe, expect, it, vi } from 'vitest';
import {
  buildResultDownloadFileName,
  downloadImageFile
} from './downloadImage';

describe('result image downloads', () => {
  it('builds a stable PNG filename from the user name', () => {
    expect(buildResultDownloadFileName('Jane Doe')).toBe('virtual-try-on-jane-doe.png');
    expect(buildResultDownloadFileName('')).toBe('virtual-try-on-result.png');
  });

  it('clicks a temporary download link for the supplied image', () => {
    const link = {
      click: vi.fn(),
      remove: vi.fn()
    } as unknown as HTMLAnchorElement;
    const appendChild = vi.fn();
    const documentLike = {
      body: { appendChild },
      createElement: vi.fn(() => link)
    } as unknown as Document;

    const didDownload = downloadImageFile(
      'data:image/png;base64,abc123',
      'virtual-try-on-jane-doe.png',
      documentLike
    );

    expect(didDownload).toBe(true);
    expect(documentLike.createElement).toHaveBeenCalledWith('a');
    expect(link.href).toBe('data:image/png;base64,abc123');
    expect(link.download).toBe('virtual-try-on-jane-doe.png');
    expect(appendChild).toHaveBeenCalledWith(link);
    expect(link.click).toHaveBeenCalledOnce();
    expect(link.remove).toHaveBeenCalledOnce();
  });

  it('does not create a link when there is no image source', () => {
    const documentLike = {
      body: { appendChild: vi.fn() },
      createElement: vi.fn()
    } as unknown as Document;

    expect(downloadImageFile('', 'virtual-try-on-result.png', documentLike)).toBe(false);
    expect(documentLike.createElement).not.toHaveBeenCalled();
  });
});
