import { readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { ensureParentDir, getAppDir } from '../../core/storage';

const authBaseUrl = 'https://accounts.google.com/o/oauth2/v2/auth';
const tokenUrl = 'https://oauth2.googleapis.com/token';
const calendarApiBaseUrl = 'https://www.googleapis.com/calendar/v3';
const calendarScope = 'https://www.googleapis.com/auth/calendar';

export type GoogleCalendarCredentials = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
};

export type GoogleCalendarToken = {
  accessToken?: string;
  refreshToken: string;
  expiresAt?: number;
};

export type CalendarEventDraft = {
  summary: string;
  start: string;
  end: string;
  timeZone?: string;
};

export type CalendarEvent = {
  id: string;
  summary: string;
  start: string;
  end: string;
  htmlLink?: string;
};

type GoogleTokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
};

type GoogleEventDate = {
  date?: string;
  dateTime?: string;
};

type GoogleEvent = {
  id?: string;
  summary?: string;
  start?: GoogleEventDate;
  end?: GoogleEventDate;
  htmlLink?: string;
};

export const getGoogleCalendarTokenPath = (): string => join(getAppDir(), 'google-calendar-token.json');

export const getGoogleCalendarCredentials = (): GoogleCalendarCredentials | undefined => {
  const clientId = process.env.GOOGLE_CALENDAR_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CALENDAR_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return undefined;
  }

  return {
    clientId,
    clientSecret,
    redirectUri: process.env.GOOGLE_CALENDAR_REDIRECT_URI || 'http://localhost:42813/oauth2callback',
  };
};

export const formatGoogleCalendarSetupHelp = (): string =>
  [
    'Google Calendar is not configured.',
    '',
    'Add these to .env:',
    'GOOGLE_CALENDAR_CLIENT_ID=...',
    'GOOGLE_CALENDAR_CLIENT_SECRET=...',
    'GOOGLE_CALENDAR_REDIRECT_URI=http://localhost:42813/oauth2callback',
    '',
    'Then restart the bot and run /calendar-connect.',
  ].join('\n');

export const createGoogleCalendarAuthUrl = (credentials: GoogleCalendarCredentials, state = 'piclaw-calendar'): string => {
  const params = new URLSearchParams({
    client_id: credentials.clientId,
    redirect_uri: credentials.redirectUri,
    response_type: 'code',
    scope: calendarScope,
    access_type: 'offline',
    prompt: 'consent',
    state,
  });

  return `${authBaseUrl}?${params.toString()}`;
};

export const extractGoogleCalendarCode = (value: string): string => {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new Error('Authorization code is required');
  }

  try {
    const parsed = new URL(trimmed);
    const code = parsed.searchParams.get('code');
    if (code !== null && code.trim().length > 0) {
      return code.trim();
    }
  } catch {
    // Plain authorization code.
  }

  return trimmed;
};

const readToken = async (): Promise<GoogleCalendarToken | undefined> => {
  try {
    return JSON.parse(await readFile(getGoogleCalendarTokenPath(), 'utf8')) as GoogleCalendarToken;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return undefined;
    }
    throw error;
  }
};

const writeToken = async (token: GoogleCalendarToken): Promise<void> => {
  const path = getGoogleCalendarTokenPath();
  await ensureParentDir(path);
  await writeFile(path, `${JSON.stringify(token, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
};

const parseTokenResponse = async (response: Response): Promise<GoogleTokenResponse> => {
  const text = await response.text();
  const data = JSON.parse(text) as GoogleTokenResponse;
  if (!response.ok || data.error !== undefined) {
    throw new Error(data.error_description || data.error || `Google token request failed: ${response.status}`);
  }
  return data;
};

export const saveGoogleCalendarCode = async (credentials: GoogleCalendarCredentials, input: string): Promise<void> => {
  const code = extractGoogleCalendarCode(input);
  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: credentials.clientId,
      client_secret: credentials.clientSecret,
      redirect_uri: credentials.redirectUri,
      grant_type: 'authorization_code',
    }),
  });
  const data = await parseTokenResponse(response);
  if (data.refresh_token === undefined) {
    throw new Error('Google did not return a refresh token. Run /calendar-connect again and approve consent.');
  }

  await writeToken({
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: data.expires_in === undefined ? undefined : Date.now() + data.expires_in * 1000,
  });
};

export const disconnectGoogleCalendar = async (): Promise<void> => {
  await rm(getGoogleCalendarTokenPath(), { force: true });
};

export const hasGoogleCalendarToken = async (): Promise<boolean> => (await readToken()) !== undefined;

const refreshAccessToken = async (credentials: GoogleCalendarCredentials, token: GoogleCalendarToken): Promise<GoogleCalendarToken> => {
  if (token.accessToken !== undefined && token.expiresAt !== undefined && token.expiresAt > Date.now() + 60_000) {
    return token;
  }

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: token.refreshToken,
      client_id: credentials.clientId,
      client_secret: credentials.clientSecret,
      grant_type: 'refresh_token',
    }),
  });
  const data = await parseTokenResponse(response);
  if (data.access_token === undefined) {
    throw new Error('Google did not return an access token');
  }

  const nextToken = {
    ...token,
    accessToken: data.access_token,
    expiresAt: data.expires_in === undefined ? undefined : Date.now() + data.expires_in * 1000,
  };
  await writeToken(nextToken);
  return nextToken;
};

const getAccessToken = async (credentials: GoogleCalendarCredentials): Promise<string> => {
  const token = await readToken();
  if (token === undefined) {
    throw new Error('Google Calendar is not connected. Run /calendar-connect first.');
  }

  return (await refreshAccessToken(credentials, token)).accessToken as string;
};

const googleCalendarFetch = async <T>(credentials: GoogleCalendarCredentials, path: string, init: RequestInit = {}): Promise<T> => {
  const accessToken = await getAccessToken(credentials);
  const response = await fetch(`${calendarApiBaseUrl}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json',
      ...init.headers,
    },
  });
  const text = await response.text();
  const data = text.length === 0 ? {} : JSON.parse(text);
  if (!response.ok) {
    const message = data?.error?.message ?? `Google Calendar request failed: ${response.status}`;
    throw new Error(message);
  }
  return data as T;
};

const toEvent = (event: GoogleEvent): CalendarEvent => ({
  id: event.id ?? '',
  summary: event.summary ?? '(no title)',
  start: event.start?.dateTime ?? event.start?.date ?? '',
  end: event.end?.dateTime ?? event.end?.date ?? '',
  htmlLink: event.htmlLink,
});

export const listGoogleCalendarEvents = async (
  credentials: GoogleCalendarCredentials,
  timeMin: Date,
  timeMax: Date,
): Promise<CalendarEvent[]> => {
  const params = new URLSearchParams({
    timeMin: timeMin.toISOString(),
    timeMax: timeMax.toISOString(),
    singleEvents: 'true',
    orderBy: 'startTime',
    maxResults: '20',
  });
  const data = await googleCalendarFetch<{ items?: GoogleEvent[] }>(credentials, `/calendars/primary/events?${params.toString()}`);
  return (data.items ?? []).map(toEvent);
};

export const createGoogleCalendarEvent = async (
  credentials: GoogleCalendarCredentials,
  draft: CalendarEventDraft,
): Promise<CalendarEvent> => {
  const body = {
    summary: draft.summary,
    start: { dateTime: draft.start, timeZone: draft.timeZone },
    end: { dateTime: draft.end, timeZone: draft.timeZone },
  };
  const data = await googleCalendarFetch<GoogleEvent>(credentials, '/calendars/primary/events', {
    method: 'POST',
    body: JSON.stringify(body),
  });
  return toEvent(data);
};

export const parseCalendarAddDraft = (input: string): CalendarEventDraft => {
  const parts = input.split('|').map((part) => part.trim()).filter((part) => part.length > 0);
  if (parts.length < 3) {
    throw new Error('Use /calendar-add title | start ISO | end ISO');
  }

  const [summary, start, end, timeZone] = parts;
  if (summary === undefined || start === undefined || end === undefined) {
    throw new Error('Use /calendar-add title | start ISO | end ISO');
  }
  if (Number.isNaN(Date.parse(start)) || Number.isNaN(Date.parse(end))) {
    throw new Error('Start and end must be valid dates, for example 2026-05-25T10:00:00+03:00');
  }
  if (Date.parse(end) <= Date.parse(start)) {
    throw new Error('End time must be after start time');
  }

  return { summary, start, end, timeZone };
};

export const formatGoogleCalendarEvents = (label: string, events: CalendarEvent[]): string => {
  if (events.length === 0) {
    return `No calendar events ${label}.`;
  }

  return [`Calendar ${label}:`, '', ...events.map((event) => `- ${event.start} - ${event.summary}`)].join('\n');
};

export const formatGoogleCalendarStatus = async (): Promise<string> => {
  const credentials = getGoogleCalendarCredentials();
  const connected = await hasGoogleCalendarToken();
  return [
    `Google Calendar configured: ${credentials === undefined ? 'no' : 'yes'}`,
    `Connected: ${connected ? 'yes' : 'no'}`,
    '',
    'Commands:',
    '/calendar-connect',
    '/calendar-code <redirect-url-or-code>',
    '/calendar-today',
    '/calendar-week',
    '/calendar-add title | start ISO | end ISO',
    '/calendar-disconnect',
  ].join('\n');
};
