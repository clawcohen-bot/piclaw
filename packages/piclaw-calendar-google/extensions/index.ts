import { readFile, rm, writeFile } from 'node:fs/promises';

import type { PiclawExtensionAPI } from '@piclaw/sdk';

const authBaseUrl = 'https://accounts.google.com/o/oauth2/v2/auth';
const tokenUrl = 'https://oauth2.googleapis.com/token';
const calendarApiBaseUrl = 'https://www.googleapis.com/calendar/v3';
const calendarScope = 'https://www.googleapis.com/auth/calendar';

export type GoogleCalendarCredentials = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
};

type GoogleCalendarToken = {
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

type CalendarEvent = {
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

type GoogleEvent = {
  id?: string;
  summary?: string;
  start?: { date?: string; dateTime?: string };
  end?: { date?: string; dateTime?: string };
  htmlLink?: string;
};

const pendingCalendarAdds = new Map<string, CalendarEventDraft>();

const getErrorMessage = (error: unknown): string => error instanceof Error ? error.message : String(error);
const truncateText = (value: string, maxLength: number): string => value.length <= maxLength ? value : `${value.slice(0, Math.max(0, maxLength - 1))}…`;

const getGoogleCalendarCredentials = (): GoogleCalendarCredentials | undefined => {
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

const formatGoogleCalendarSetupHelp = (): string => [
  'Google Calendar is not configured.',
  '',
  'Add these to .env:',
  'GOOGLE_CALENDAR_CLIENT_ID=...',
  'GOOGLE_CALENDAR_CLIENT_SECRET=...',
  'GOOGLE_CALENDAR_REDIRECT_URI=http://localhost:42813/oauth2callback',
  '',
  'Then restart the bot and run /calendar-connect.',
].join('\n');

const getCredentialsOrHelp = () => getGoogleCalendarCredentials() ?? formatGoogleCalendarSetupHelp();

const createGoogleCalendarAuthUrl = (credentials: GoogleCalendarCredentials, state = 'piclaw-calendar'): string => {
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

const extractGoogleCalendarCode = (value: string): string => {
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

const readToken = async (piclaw: PiclawExtensionAPI): Promise<GoogleCalendarToken | undefined> => {
  try {
    return JSON.parse(await readFile(piclaw.storage.appDataPath('google-calendar-token.json'), 'utf8')) as GoogleCalendarToken;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return undefined;
    }
    throw error;
  }
};

const writeToken = async (piclaw: PiclawExtensionAPI, token: GoogleCalendarToken): Promise<void> => {
  const path = piclaw.storage.appDataPath('google-calendar-token.json');
  await piclaw.storage.ensureParentDir(path);
  await writeFile(path, `${JSON.stringify(token, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
};

const parseTokenResponse = async (response: Response): Promise<GoogleTokenResponse> => {
  const data = JSON.parse(await response.text()) as GoogleTokenResponse;
  if (!response.ok || data.error !== undefined) {
    throw new Error(data.error_description || data.error || `Google token request failed: ${response.status}`);
  }
  return data;
};

const saveGoogleCalendarCode = async (piclaw: PiclawExtensionAPI, credentials: GoogleCalendarCredentials, input: string): Promise<void> => {
  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code: extractGoogleCalendarCode(input),
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

  await writeToken(piclaw, {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: data.expires_in === undefined ? undefined : Date.now() + data.expires_in * 1000,
  });
};

const disconnectGoogleCalendar = async (piclaw: PiclawExtensionAPI): Promise<void> => {
  await rm(piclaw.storage.appDataPath('google-calendar-token.json'), { force: true });
};

const refreshAccessToken = async (piclaw: PiclawExtensionAPI, credentials: GoogleCalendarCredentials, token: GoogleCalendarToken): Promise<GoogleCalendarToken> => {
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

  const nextToken = { ...token, accessToken: data.access_token, expiresAt: data.expires_in === undefined ? undefined : Date.now() + data.expires_in * 1000 };
  await writeToken(piclaw, nextToken);
  return nextToken;
};

const getAccessToken = async (piclaw: PiclawExtensionAPI, credentials: GoogleCalendarCredentials): Promise<string> => {
  const token = await readToken(piclaw);
  if (token === undefined) {
    throw new Error('Google Calendar is not connected. Run /calendar-connect first.');
  }
  return (await refreshAccessToken(piclaw, credentials, token)).accessToken as string;
};

const googleCalendarFetch = async <T>(piclaw: PiclawExtensionAPI, credentials: GoogleCalendarCredentials, path: string, init: RequestInit = {}): Promise<T> => {
  const accessToken = await getAccessToken(piclaw, credentials);
  const response = await fetch(`${calendarApiBaseUrl}${path}`, {
    ...init,
    headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json', ...init.headers },
  });
  const text = await response.text();
  const data = text.length === 0 ? {} : JSON.parse(text);
  if (!response.ok) {
    throw new Error(data?.error?.message ?? `Google Calendar request failed: ${response.status}`);
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

const listGoogleCalendarEvents = async (piclaw: PiclawExtensionAPI, credentials: GoogleCalendarCredentials, timeMin: Date, timeMax: Date): Promise<CalendarEvent[]> => {
  const params = new URLSearchParams({ timeMin: timeMin.toISOString(), timeMax: timeMax.toISOString(), singleEvents: 'true', orderBy: 'startTime', maxResults: '20' });
  const data = await googleCalendarFetch<{ items?: GoogleEvent[] }>(piclaw, credentials, `/calendars/primary/events?${params.toString()}`);
  return (data.items ?? []).map(toEvent);
};

const createGoogleCalendarEvent = async (piclaw: PiclawExtensionAPI, credentials: GoogleCalendarCredentials, draft: CalendarEventDraft): Promise<CalendarEvent> => {
  const data = await googleCalendarFetch<GoogleEvent>(piclaw, credentials, '/calendars/primary/events', {
    method: 'POST',
    body: JSON.stringify({ summary: draft.summary, start: { dateTime: draft.start, timeZone: draft.timeZone }, end: { dateTime: draft.end, timeZone: draft.timeZone } }),
  });
  return toEvent(data);
};

const parseCalendarAddDraft = (input: string): CalendarEventDraft => {
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

const formatGoogleCalendarEvents = (label: string, events: CalendarEvent[]): string => events.length === 0
  ? `No calendar events ${label}.`
  : [`Calendar ${label}:`, '', ...events.map((event) => `- ${event.start} - ${event.summary}`)].join('\n');

const formatGoogleCalendarStatus = async (piclaw: PiclawExtensionAPI): Promise<string> => {
  const credentials = getGoogleCalendarCredentials();
  const connected = (await readToken(piclaw)) !== undefined;
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

const createCalendarAddId = (): string => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const formatCalendarAddPreview = (draft: CalendarEventDraft): string => [
  'Create this calendar event?',
  '',
  `Title: ${draft.summary}`,
  `Start: ${draft.start}`,
  `End: ${draft.end}`,
  draft.timeZone === undefined ? undefined : `Time zone: ${draft.timeZone}`,
].filter((line): line is string => line !== undefined).join('\n');

const replyWithCalendarAddConfirmation = async (context: any, draft: CalendarEventDraft, actionId: string): Promise<boolean> => {
  if (typeof context?.reply !== 'function') {
    return false;
  }
  await context.reply(formatCalendarAddPreview(draft), {
    reply_markup: { inline_keyboard: [[{ text: 'Create event', callback_data: `calendaradd:confirm:${actionId}` }], [{ text: 'Cancel', callback_data: `calendaradd:cancel:${actionId}` }]] },
  });
  return true;
};

const answerCallback = async (context: any, message: string): Promise<void> => {
  if (typeof context?.answerCbQuery === 'function') {
    await context.answerCbQuery(message);
  }
};

const createEventFromDraft = async (piclaw: PiclawExtensionAPI, credentials: GoogleCalendarCredentials, draft: CalendarEventDraft): Promise<string> => {
  const event = await createGoogleCalendarEvent(piclaw, credentials, draft);
  return `Created calendar event:\n${event.summary}\n${event.start}`;
};

export default function (piclaw: PiclawExtensionAPI) {
  piclaw.registerTool({
    name: 'calendar.list-events',
    description: 'List Google Calendar events between two ISO dates.',
    handler: async (input: any) => {
      const credentials = getGoogleCalendarCredentials();
      if (credentials === undefined) {
        throw new Error(formatGoogleCalendarSetupHelp());
      }
      return listGoogleCalendarEvents(piclaw, credentials, new Date(String(input?.start ?? '')), new Date(String(input?.end ?? '')));
    },
  });

  piclaw.registerTool({
    name: 'calendar.create-event',
    description: 'Create a Google Calendar event.',
    handler: async (input: any) => {
      const credentials = getGoogleCalendarCredentials();
      if (credentials === undefined) {
        throw new Error(formatGoogleCalendarSetupHelp());
      }
      return createGoogleCalendarEvent(piclaw, credentials, input);
    },
  });

  piclaw.registerCommand({ name: 'calendar', description: 'Show Google Calendar status.', handler: () => formatGoogleCalendarStatus(piclaw) });

  piclaw.registerCommand({
    name: 'calendar-connect',
    description: 'Start Google Calendar OAuth setup.',
    handler: () => {
      const credentials = getCredentialsOrHelp();
      if (typeof credentials === 'string') {
        return credentials;
      }
      return ['Open this Google link and approve Calendar access:', createGoogleCalendarAuthUrl(credentials), '', 'After approval, copy the final redirect URL or code and send:', '/calendar-code <redirect-url-or-code>'].join('\n');
    },
  });

  piclaw.registerCommand({
    name: 'calendar-code',
    description: 'Finish Google Calendar OAuth setup.',
    handler: async (input: any) => {
      const credentials = getCredentialsOrHelp();
      if (typeof credentials === 'string') {
        return credentials;
      }
      if (input.args.length === 0) {
        return 'Use /calendar-code <redirect-url-or-code>';
      }
      try {
        await saveGoogleCalendarCode(piclaw, credentials, input.args);
        return 'Google Calendar connected. Use /calendar-today or /calendar-week.';
      } catch (error) {
        return `Calendar connect failed: ${getErrorMessage(error)}`;
      }
    },
  });

  piclaw.registerCommand({ name: 'calendar-disconnect', description: 'Disconnect Google Calendar.', handler: async () => { await disconnectGoogleCalendar(piclaw); return 'Google Calendar disconnected.'; } });

  piclaw.registerCommand({
    name: 'calendar-today',
    description: 'Show today Google Calendar events.',
    handler: async () => {
      const credentials = getGoogleCalendarCredentials();
      if (credentials === undefined) {
        return formatGoogleCalendarSetupHelp();
      }
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      const end = new Date(start);
      end.setDate(end.getDate() + 1);
      try {
        return truncateText(formatGoogleCalendarEvents('today', await listGoogleCalendarEvents(piclaw, credentials, start, end)), 3500);
      } catch (error) {
        return `Calendar read failed: ${getErrorMessage(error)}`;
      }
    },
  });

  piclaw.registerCommand({
    name: 'calendar-week',
    description: 'Show this week Google Calendar events.',
    handler: async () => {
      const credentials = getGoogleCalendarCredentials();
      if (credentials === undefined) {
        return formatGoogleCalendarSetupHelp();
      }
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      const end = new Date(start);
      end.setDate(end.getDate() + 7);
      try {
        return truncateText(formatGoogleCalendarEvents('this week', await listGoogleCalendarEvents(piclaw, credentials, start, end)), 3500);
      } catch (error) {
        return `Calendar read failed: ${getErrorMessage(error)}`;
      }
    },
  });

  piclaw.registerCommand({
    name: 'calendar-add',
    description: 'Create a Google Calendar event from: title | start ISO | end ISO.',
    handler: async (input: any) => {
      const credentials = getGoogleCalendarCredentials();
      if (credentials === undefined) {
        return formatGoogleCalendarSetupHelp();
      }
      try {
        const draft = parseCalendarAddDraft(input.args);
        const actionId = createCalendarAddId();
        if (await replyWithCalendarAddConfirmation(input.context, draft, actionId)) {
          pendingCalendarAdds.set(actionId, draft);
          return;
        }
        return `${formatCalendarAddPreview(draft)}\n\nNo callback-capable connector found. Creating now.\n${await createEventFromDraft(piclaw, credentials, draft)}`;
      } catch (error) {
        return getErrorMessage(error);
      }
    },
  });

  piclaw.registerCallbackAction({
    name: 'calendar-add-confirm',
    description: 'Confirm a pending Google Calendar event draft.',
    pattern: /^calendaradd:confirm:[a-z0-9-]+$/,
    handler: async (input: any) => {
      const actionId = String(input.data).replace(/^calendaradd:confirm:/, '');
      const draft = pendingCalendarAdds.get(actionId);
      pendingCalendarAdds.delete(actionId);
      await answerCallback(input.context, draft === undefined ? 'Expired' : 'Creating event');
      if (draft === undefined) {
        return 'Calendar event draft expired. Run /calendar-add again.';
      }
      const credentials = getGoogleCalendarCredentials();
      if (credentials === undefined) {
        return formatGoogleCalendarSetupHelp();
      }
      try {
        return await createEventFromDraft(piclaw, credentials, draft);
      } catch (error) {
        return `Calendar create failed: ${getErrorMessage(error)}`;
      }
    },
  });

  piclaw.registerCallbackAction({
    name: 'calendar-add-cancel',
    description: 'Cancel a pending Google Calendar event draft.',
    pattern: /^calendaradd:cancel:[a-z0-9-]+$/,
    handler: async (input: any) => {
      const actionId = String(input.data).replace(/^calendaradd:cancel:/, '');
      pendingCalendarAdds.delete(actionId);
      await answerCallback(input.context, 'Cancelled');
      return 'Calendar event cancelled.';
    },
  });
}
