import { mkdtemp, readFile, rm, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';

import {
  createGoogleCalendarAuthUrl,
  createGoogleCalendarEvent,
  disconnectGoogleCalendar,
  extractGoogleCalendarCode,
  formatGoogleCalendarEvents,
  formatGoogleCalendarStatus,
  getGoogleCalendarCredentials,
  getGoogleCalendarTokenPath,
  listGoogleCalendarEvents,
  parseCalendarAddDraft,
  saveGoogleCalendarCode,
} from '../google-calendar';
import { getAppDir } from '../storage';

const originalCwd = process.cwd();
let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'calendar-test-'));
  process.chdir(tempDir);
  delete process.env.GOOGLE_CALENDAR_CLIENT_ID;
  delete process.env.GOOGLE_CALENDAR_CLIENT_SECRET;
  delete process.env.GOOGLE_CALENDAR_REDIRECT_URI;
});

afterEach(async () => {
  vi.restoreAllMocks();
  process.chdir(originalCwd);
  await rm(tempDir, { recursive: true, force: true });
});

describe('google calendar helpers', () => {
  it('builds an oauth url from env credentials', () => {
    process.env.GOOGLE_CALENDAR_CLIENT_ID = 'client-id';
    process.env.GOOGLE_CALENDAR_CLIENT_SECRET = 'client-secret';

    const credentials = getGoogleCalendarCredentials();
    expect(credentials).toEqual({
      clientId: 'client-id',
      clientSecret: 'client-secret',
      redirectUri: 'http://localhost:42813/oauth2callback',
    });

    const url = createGoogleCalendarAuthUrl(credentials as NonNullable<typeof credentials>);
    expect(url).toContain('client_id=client-id');
    expect(url).toContain('scope=https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fcalendar');
    expect(url).toContain('access_type=offline');
  });

  it('extracts auth code from plain code or redirect url', () => {
    expect(extractGoogleCalendarCode('abc123')).toBe('abc123');
    expect(extractGoogleCalendarCode('http://localhost:42813/oauth2callback?code=code123&state=x')).toBe('code123');
    expect(() => extractGoogleCalendarCode('   ')).toThrow('Authorization code is required');
  });

  it('parses calendar add drafts', () => {
    expect(parseCalendarAddDraft('Meet Yaniv | 2026-05-25T10:00:00+03:00 | 2026-05-25T11:00:00+03:00')).toEqual({
      summary: 'Meet Yaniv',
      start: '2026-05-25T10:00:00+03:00',
      end: '2026-05-25T11:00:00+03:00',
      timeZone: undefined,
    });
    expect(() => parseCalendarAddDraft('bad')).toThrow('Use /calendar-add');
    expect(() => parseCalendarAddDraft('Bad | 2026-05-25T11:00:00+03:00 | 2026-05-25T10:00:00+03:00')).toThrow(
      'End time must be after start time',
    );
  });

  it('formats status and events', async () => {
    await expect(formatGoogleCalendarStatus()).resolves.toContain('Google Calendar configured: no');
    expect(formatGoogleCalendarEvents('today', [])).toBe('No calendar events today.');
    expect(
      formatGoogleCalendarEvents('today', [
        { id: '1', summary: 'Meeting', start: '2026-05-25T10:00:00+03:00', end: '2026-05-25T11:00:00+03:00' },
      ]),
    ).toContain('Meeting');
  });

  it('saves oauth code response token', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ access_token: 'access', refresh_token: 'refresh', expires_in: 3600 }), { status: 200 }),
    );

    await saveGoogleCalendarCode(
      { clientId: 'client', clientSecret: 'secret', redirectUri: 'http://localhost/callback' },
      'http://localhost/callback?code=oauth-code',
    );

    expect(fetchMock).toHaveBeenCalledOnce();
    await expect(readFile(getGoogleCalendarTokenPath(), 'utf8')).resolves.toContain('refresh');
    await expect(formatGoogleCalendarStatus()).resolves.toContain('Connected: yes');
  });

  it('reads and creates events with refreshed access token', async () => {
    await mkdir(getAppDir(), { recursive: true });
    await writeFile(getGoogleCalendarTokenPath(), JSON.stringify({ refreshToken: 'refresh', expiresAt: 0 }), 'utf8');

    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: 'fresh', expires_in: 3600 }), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            items: [
              {
                id: 'event-1',
                summary: 'Today meeting',
                start: { dateTime: '2026-05-25T10:00:00+03:00' },
                end: { dateTime: '2026-05-25T11:00:00+03:00' },
              },
            ],
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: 'event-2',
            summary: 'Created meeting',
            start: { dateTime: '2026-05-25T12:00:00+03:00' },
            end: { dateTime: '2026-05-25T13:00:00+03:00' },
          }),
          { status: 200 },
        ),
      );

    const credentials = { clientId: 'client', clientSecret: 'secret', redirectUri: 'http://localhost/callback' };
    await expect(listGoogleCalendarEvents(credentials, new Date('2026-05-25T00:00:00Z'), new Date('2026-05-26T00:00:00Z'))).resolves.toEqual([
      {
        id: 'event-1',
        summary: 'Today meeting',
        start: '2026-05-25T10:00:00+03:00',
        end: '2026-05-25T11:00:00+03:00',
        htmlLink: undefined,
      },
    ]);
    await expect(
      createGoogleCalendarEvent(credentials, {
        summary: 'Created meeting',
        start: '2026-05-25T12:00:00+03:00',
        end: '2026-05-25T13:00:00+03:00',
      }),
    ).resolves.toMatchObject({ summary: 'Created meeting' });
  });

  it('handles disconnect and google errors', async () => {
    await mkdir(getAppDir(), { recursive: true });
    await writeFile(getGoogleCalendarTokenPath(), JSON.stringify({ refreshToken: 'refresh', accessToken: 'access', expiresAt: Date.now() + 3600_000 }), 'utf8');
    await disconnectGoogleCalendar();
    await expect(readFile(getGoogleCalendarTokenPath(), 'utf8')).rejects.toThrow();

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ error: 'invalid_grant', error_description: 'Bad code' }), { status: 400 }),
    );
    await expect(
      saveGoogleCalendarCode({ clientId: 'client', clientSecret: 'secret', redirectUri: 'http://localhost/callback' }, 'bad-code'),
    ).rejects.toThrow('Bad code');
  });

  it('covers alternative credential and parsing branches', () => {
    process.env.GOOGLE_CALENDAR_CLIENT_ID = 'client-id';
    process.env.GOOGLE_CALENDAR_CLIENT_SECRET = 'client-secret';
    process.env.GOOGLE_CALENDAR_REDIRECT_URI = 'http://custom/callback';
    expect(getGoogleCalendarCredentials()?.redirectUri).toBe('http://custom/callback');
    expect(extractGoogleCalendarCode('http://localhost/callback?state=missing-code')).toBe('http://localhost/callback?state=missing-code');
    expect(() => parseCalendarAddDraft('Bad | not-a-date | 2026-05-25T10:00:00+03:00')).toThrow('Start and end must be valid dates');
    expect(parseCalendarAddDraft('Meet | 2026-05-25T10:00:00+03:00 | 2026-05-25T11:00:00+03:00 | Asia/Jerusalem')).toMatchObject({
      timeZone: 'Asia/Jerusalem',
    });
  });

  it('handles token and api failure branches', async () => {
    const credentials = { clientId: 'client', clientSecret: 'secret', redirectUri: 'http://localhost/callback' };
    await expect(listGoogleCalendarEvents(credentials, new Date(), new Date())).rejects.toThrow('Google Calendar is not connected');

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(JSON.stringify({ access_token: 'access' }), { status: 200 }));
    await expect(saveGoogleCalendarCode(credentials, 'code-without-refresh')).rejects.toThrow('Google did not return a refresh token');

    vi.restoreAllMocks();
    await mkdir(getAppDir(), { recursive: true });
    await writeFile(getGoogleCalendarTokenPath(), JSON.stringify({ refreshToken: 'refresh', expiresAt: 0 }), 'utf8');
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(JSON.stringify({ expires_in: 3600 }), { status: 200 }));
    await expect(listGoogleCalendarEvents(credentials, new Date(), new Date())).rejects.toThrow('Google did not return an access token');

    vi.restoreAllMocks();
    await writeFile(getGoogleCalendarTokenPath(), JSON.stringify({ refreshToken: 'refresh', accessToken: 'access', expiresAt: Date.now() + 3600_000 }), 'utf8');
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(JSON.stringify({ error: { message: 'API down' } }), { status: 500 }));
    await expect(listGoogleCalendarEvents(credentials, new Date(), new Date())).rejects.toThrow('API down');

    vi.restoreAllMocks();
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(JSON.stringify({}), { status: 200 }));
    await expect(listGoogleCalendarEvents(credentials, new Date(), new Date())).resolves.toEqual([]);

    vi.restoreAllMocks();
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ items: [{ start: { date: '2026-05-25' }, end: { date: '2026-05-26' } }] }), { status: 200 }),
    );
    await expect(listGoogleCalendarEvents(credentials, new Date(), new Date())).resolves.toEqual([
      { id: '', summary: '(no title)', start: '2026-05-25', end: '2026-05-26', htmlLink: undefined },
    ]);
  });
});
