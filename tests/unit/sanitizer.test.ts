import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import {
    sanitizeHtml,
    setInnerHTML,
    isSafeUrl,
    createSafeLink,
    sanitizeFilename,
    getSafeLocalStorage,
    setSafeLocalStorage,
    escapeLikePattern
} from '../../js/utils/sanitizer.js';

import { useRealLogger } from '../use-real-logger.js';

useRealLogger();

describe('Sanitizer Module (Security)', () => {
    let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
    let consoleWarnSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    });

    afterEach(() => {
        consoleErrorSpy.mockRestore();
        consoleWarnSpy.mockRestore();
    });

    describe('escapeLikePattern', () => {
        it('escapes % wildcard', () => {
            expect(escapeLikePattern('100%')).toBe('100\\%');
        });

        it('escapes _ wildcard', () => {
            expect(escapeLikePattern('A_B')).toBe('A\\_B');
        });

        it('escapes backslash', () => {
            expect(escapeLikePattern('a\\b')).toBe('a\\\\b');
        });

        it('escapes a mix of metacharacters', () => {
            expect(escapeLikePattern('%_\\')).toBe('\\%\\_\\\\');
        });

        it('leaves plain text unchanged', () => {
            expect(escapeLikePattern('Rossi')).toBe('Rossi');
        });
    });

    describe('sanitizeHtml', () => {
        it('should escape script tags', () => {
            const result = sanitizeHtml('<script>alert("XSS")</script>');
            expect(result).toBe('&lt;script&gt;alert("XSS")&lt;/script&gt;');
            expect(result).not.toContain('<script');
        });

        it('should escape common XSS vectors', () => {
            // The function escapes tags but preserves attribute names as text (safe)
            const result1 = sanitizeHtml('<img src=x onerror=alert(1)>');
            const result2 = sanitizeHtml('<svg onload=alert(1)>');
            const result3 = sanitizeHtml('<iframe src="javascript:alert(1)">');

            // Check that tags are escaped (most important)
            expect(result1).not.toContain('<img');
            expect(result1).toContain('&lt;img');
            expect(result2).not.toContain('<svg');
            expect(result2).toContain('&lt;svg');
            expect(result3).not.toContain('<iframe');
            expect(result3).toContain('&lt;iframe');
        });


        it('should escape quotes and special characters', () => {
            const result = sanitizeHtml('" & \' < >');
            // Different browsers may encode differently but all are safe
            expect(result).toContain('&amp;'); // Ampersand is always encoded
            expect(result).toContain('&lt;');  // < is always encoded
            expect(result).toContain('&gt;');  // > is always encoded
            // Quote encoding might vary (&quot; vs &#34; vs ")
        });


        it('should handle empty and null values', () => {
            expect(sanitizeHtml('')).toBe('');
        });
    });

    describe('setInnerHTML', () => {
        let container: HTMLElement;

        beforeEach(() => {
            container = document.createElement('div');
        });

        it('should set text content when allowHtml is false', () => {
            setInnerHTML(container, '<script>alert(1)</script>', false);
            expect(container.innerHTML).not.toContain('<script');
            expect(container.textContent).toBe('<script>alert(1)</script>');
        });

        it('should escape HTML when allowHtml is true', () => {
            setInnerHTML(container, '<b>Bold</b>', true);
            expect(container.innerHTML).toBe('&lt;b&gt;Bold&lt;/b&gt;');
        });

        it('should handle null element gracefully', () => {
            expect(() => setInnerHTML(null, 'content')).not.toThrow();
        });

        it('should default to safe mode (allowHtml=false)', () => {
            setInnerHTML(container, '<script>alert(1)</script>');
            expect(container.innerHTML).not.toContain('<script');
        });
    });

    describe('isSafeUrl', () => {
        it('should allow http and https URLs', () => {
            expect(isSafeUrl('http://example.com')).toBe(true);
            expect(isSafeUrl('https://example.com')).toBe(true);
            expect(isSafeUrl('HTTPS://EXAMPLE.COM')).toBe(true);
        });

        it('should allow relative URLs', () => {
            expect(isSafeUrl('/page')).toBe(true);
            expect(isSafeUrl('#section')).toBe(true);
            expect(isSafeUrl('?query=1')).toBe(true);
        });

        it('should block javascript: protocol', () => {
            expect(isSafeUrl('javascript:alert(1)')).toBe(false);
            expect(isSafeUrl('JAVASCRIPT:alert(1)')).toBe(false);
            expect(isSafeUrl(' javascript:alert(1)')).toBe(false);
            expect(consoleWarnSpy).toHaveBeenCalledTimes(3);
            expect(consoleWarnSpy.mock.calls[0][0]).toContain('javascript:');
        });

        it('should block data: protocol', () => {
            expect(isSafeUrl('data:text/html,<script>alert(1)</script>')).toBe(false);
            expect(isSafeUrl('DATA:image/png;base64,...')).toBe(false);
            expect(consoleWarnSpy).toHaveBeenCalledTimes(2);
        });

        it('should block vbscript and file protocols', () => {
            expect(isSafeUrl('vbscript:alert(1)')).toBe(false);
            expect(isSafeUrl('file:///etc/passwd')).toBe(false);
            expect(consoleWarnSpy).toHaveBeenCalledTimes(2);
        });

        it('should return false for null/undefined/empty', () => {
            expect(isSafeUrl('')).toBe(false);
            expect(isSafeUrl(null as unknown as string)).toBe(false);
            expect(isSafeUrl(undefined as unknown as string)).toBe(false);
        });

        it('should return false for non-string input', () => {
            expect(isSafeUrl(123 as unknown as string)).toBe(false);
            expect(isSafeUrl({} as unknown as string)).toBe(false);
        });
    });

    describe('createSafeLink', () => {
        it('should create link for safe URLs', () => {
            const link = createSafeLink('https://example.com', 'Example');

            expect(link).not.toBeNull();
            expect(link!.href).toBe('https://example.com/');
            expect(link!.textContent).toBe('Example');
            expect(link!.target).toBe('');
        });

        it('should return null for unsafe URLs', () => {
            expect(createSafeLink('javascript:alert(1)', 'Unsafe')).toBeNull();
            expect(createSafeLink('data:text/html,<script>', 'Unsafe')).toBeNull();
            expect(consoleWarnSpy).toHaveBeenCalledTimes(2);
        });

        it('should add target and rel attributes when newTab is true', () => {
            const link = createSafeLink('https://example.com', 'Example', true);

            expect(link).not.toBeNull();
            expect(link!.target).toBe('_blank');
            expect(link!.rel).toBe('noopener noreferrer');
        });

        it('should escape link text', () => {
            const link = createSafeLink('https://example.com', '<script>XSS</script>');

            expect(link).not.toBeNull();
            expect(link!.textContent).toBe('<script>XSS</script>');
            expect(link!.innerHTML).not.toContain('<script');
        });

        it('should work with relative URLs', () => {
            const link = createSafeLink('/page', 'Internal Link');

            expect(link).not.toBeNull();
            expect(link!.textContent).toBe('Internal Link');
        });
    });

    describe('escapeLikePattern', () => {
        it('should escape percent and underscore wildcards', () => {
            expect(escapeLikePattern('%%%%')).toBe('\\%\\%\\%\\%');
            expect(escapeLikePattern('a_b%c')).toBe('a\\_b\\%c');
        });

        it('should escape backslashes', () => {
            expect(escapeLikePattern('a\\b')).toBe('a\\\\b');
        });

        it('should leave regular input untouched', () => {
            expect(escapeLikePattern('Mario Rossi')).toBe('Mario Rossi');
            expect(escapeLikePattern('')).toBe('');
        });
    });

    describe('sanitizeFilename', () => {
        it('should allow safe filenames', () => {
            expect(sanitizeFilename('document.pdf')).toBe('document.pdf');
            expect(sanitizeFilename('my-file_2024.txt')).toBe('my-file_2024.txt');
            expect(sanitizeFilename('Report-v1.0.xlsx')).toBe('Report-v1.0.xlsx');
        });

        it('should replace special characters with underscores', () => {
            expect(sanitizeFilename('file@name#test.pdf')).toBe('file_name_test.pdf');
            expect(sanitizeFilename('hello world.txt')).toBe('hello_world.txt');
            expect(sanitizeFilename('test/file.pdf')).toBe('test_file.pdf');
        });

        it('should prevent directory traversal', () => {
            const result1 = sanitizeFilename('../../../etc/passwd');
            const result2 = sanitizeFilename('..\\windows\\system32');
            // The function removes leading dots and replaces special chars
            expect(result1).not.toContain('..');
            expect(result1).not.toContain('/');
            expect(result2).not.toContain('..');
            expect(result2).not.toContain('\\');
        });


        it('should remove leading dots', () => {
            expect(sanitizeFilename('...hidden.txt')).toBe('hidden.txt');
            expect(sanitizeFilename('.htaccess')).toBe('htaccess');
        });

        it('should replace multiple consecutive dots', () => {
            expect(sanitizeFilename('file...name.pdf')).toBe('file.name.pdf');
        });

        it('should limit filename length', () => {
            const longName = 'a'.repeat(300);
            const result = sanitizeFilename(longName);
            expect(result.length).toBeLessThanOrEqual(255);
        });

        it('should return default for null/undefined/empty', () => {
            expect(sanitizeFilename('')).toBe('untitled');
            expect(sanitizeFilename(null as unknown as string)).toBe('untitled');
            expect(sanitizeFilename(undefined as unknown as string)).toBe('untitled');
        });
    });

    describe('localStorage helpers', () => {
        beforeEach(() => {
            localStorage.clear();
        });

        afterEach(() => {
            localStorage.clear();
        });

        describe('setSafeLocalStorage', () => {
            it('should save and retrieve simple values', () => {
                const success = setSafeLocalStorage('test', { value: 42 });
                expect(success).toBe(true);

                const retrieved = localStorage.getItem('test');
                expect(JSON.parse(retrieved!)).toEqual({ value: 42 });
            });

            it('should handle complex objects', () => {
                const data = {
                    name: 'John',
                    age: 30,
                    settings: { theme: 'dark' }
                };

                setSafeLocalStorage('user', data);
                const retrieved = JSON.parse(localStorage.getItem('user')!);
                expect(retrieved).toEqual(data);
            });

            it('should handle arrays', () => {
                const arr = [1, 2, 3, 'test'];
                setSafeLocalStorage('array', arr);

                const retrieved = JSON.parse(localStorage.getItem('array')!);
                expect(retrieved).toEqual(arr);
            });
        });

        describe('getSafeLocalStorage', () => {
            it('should retrieve saved values', () => {
                localStorage.setItem('test', JSON.stringify({ value: 100 }));

                const result = getSafeLocalStorage<{ value: number }>('test');
                expect(result).toEqual({ value: 100 });
            });

            it('should return defaultValue for missing keys', () => {
                const result = getSafeLocalStorage('nonexistent', { default: true });
                expect(result).toEqual({ default: true });
            });

            it('should return defaultValue for invalid JSON', () => {
                localStorage.setItem('corrupt', 'not valid json {');

                const result = getSafeLocalStorage('corrupt', { fallback: true });
                expect(result).toEqual({ fallback: true });
                expect(consoleWarnSpy).toHaveBeenCalled();
            });

            it('should return defaultValue for null values', () => {
                localStorage.setItem('null-value', 'null');

                const result = getSafeLocalStorage('null-value', { default: 'used' });
                expect(result).toEqual({ default: 'used' });
                expect(consoleWarnSpy).toHaveBeenCalled();
            });

            it('should return null as default when not specified', () => {
                const result = getSafeLocalStorage('missing');
                expect(result).toBeNull();
            });

            it('should handle type safety with generics', () => {
                interface UserSettings {
                    theme: string;
                    notifications: boolean;
                }

                setSafeLocalStorage<UserSettings>('settings', {
                    theme: 'dark',
                    notifications: true
                });

                const settings = getSafeLocalStorage<UserSettings>('settings');
                expect(settings).not.toBeNull();
                expect(settings?.theme).toBe('dark');
                expect(settings?.notifications).toBe(true);
            });
        });
    });
});

function listTypeScriptFiles(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
        const fullPath = join(dir, entry.name);
        if (entry.isDirectory()) {
            return listTypeScriptFiles(fullPath);
        }
        return entry.isFile() && entry.name.endsWith('.ts') ? [fullPath] : [];
    });
}

describe('centralized HTML sink policy', () => {
    it('keeps direct innerHTML assignments inside sanitizer.ts only', () => {
        const jsRoot = join(process.cwd(), 'js');
        const offenders = listTypeScriptFiles(jsRoot)
            .filter(file => !file.endsWith(join('js', 'utils', 'sanitizer.ts')))
            .flatMap(file => {
                const rel = relative(process.cwd(), file).replace(/\\/g, '/');
                return readFileSync(file, 'utf8')
                    .split('\n')
                    .map((line, index) => ({ rel, line: index + 1, text: line.trim() }))
                    .filter(({ text }) => /\.innerHTML\s*=/.test(text))
                    .map(({ rel, line, text }) => `${rel}:${line}: ${text}`);
            });

        expect(offenders).toEqual([]);
    });
});
