import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The web app manifest is hand-written JSON served straight from public/, so nothing typechecks
 * it. Guard the parts a PWA install depends on: it parses, has the fields Chrome/Safari require
 * for an installable app, and every icon it references actually exists in public/.
 */
describe('manifest.webmanifest', () => {
  const publicDir = join(__dirname, '..', 'public');
  const raw = readFileSync(join(publicDir, 'manifest.webmanifest'), 'utf8');

  it('is valid JSON', () => {
    expect(() => JSON.parse(raw)).not.toThrow();
  });

  const manifest = JSON.parse(raw) as {
    name: string;
    short_name: string;
    start_url: string;
    display: string;
    background_color: string;
    theme_color: string;
    icons: Array<{ src: string; sizes: string; type: string }>;
  };

  it('has the fields an installable PWA needs', () => {
    expect(manifest.name).toBe('6mansdle');
    expect(manifest.short_name).toBe('6mansdle');
    expect(manifest.start_url).toBe('/daily');
    expect(manifest.display).toBe('standalone');
    expect(manifest.theme_color).toBe('#0f0f0f');
    expect(manifest.background_color).toBe('#0f0f0f');
    expect(Array.isArray(manifest.icons)).toBe(true);
    expect(manifest.icons.length).toBeGreaterThan(0);
  });

  it('references icon files that exist in public/', () => {
    for (const icon of manifest.icons) {
      expect(icon.src.startsWith('/')).toBe(true);
      const iconPath = join(publicDir, icon.src.slice(1));
      expect(existsSync(iconPath), `manifest references missing icon: ${icon.src}`).toBe(true);
    }
  });

  it('includes both a 192 and a 512 icon (the sizes Android/Chrome expect)', () => {
    const sizes = manifest.icons.map((icon) => icon.sizes);
    expect(sizes).toContain('192x192');
    expect(sizes).toContain('512x512');
  });
});
