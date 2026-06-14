import {
  createGoogleCalendarAuthUrl,
  createGoogleCalendarEvent,
  disconnectGoogleCalendar,
  formatGoogleCalendarEvents,
  formatGoogleCalendarSetupHelp,
  formatGoogleCalendarStatus,
  getGoogleCalendarCredentials,
  listGoogleCalendarEvents,
  parseCalendarAddDraft,
  saveGoogleCalendarCode,
} from '../../../apps/piclaw/src/features/calendar/google-calendar';
import type { CalendarEventDraft, GoogleCalendarCredentials } from '../../../apps/piclaw/src/features/calendar/google-calendar';
import { getErrorMessage } from '../../../apps/piclaw/src/core/error';
import { truncateText } from '../../../apps/piclaw/src/messages/text';

const pendingCalendarAdds = new Map<string, CalendarEventDraft>();

const getCredentialsOrHelp = () => {
  const credentials = getGoogleCalendarCredentials();
  return credentials ?? formatGoogleCalendarSetupHelp();
};

const createCalendarAddId = (): string => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const formatCalendarAddPreview = (draft: CalendarEventDraft): string =>
  [
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
    reply_markup: {
      inline_keyboard: [
        [{ text: 'Create event', callback_data: `calendaradd:confirm:${actionId}` }],
        [{ text: 'Cancel', callback_data: `calendaradd:cancel:${actionId}` }],
      ],
    },
  });
  return true;
};

const answerCallback = async (context: any, message: string): Promise<void> => {
  if (typeof context?.answerCbQuery === 'function') {
    await context.answerCbQuery(message);
  }
};

const createEventFromDraft = async (credentials: GoogleCalendarCredentials, draft: CalendarEventDraft): Promise<string> => {
  const event = await createGoogleCalendarEvent(credentials, draft);
  return `Created calendar event:\n${event.summary}\n${event.start}`;
};

export default function (piclaw: any) {
  piclaw.registerTool({
    name: 'calendar.list-events',
    description: 'List Google Calendar events between two ISO dates.',
    handler: async (input: any) => {
      const credentials = getGoogleCalendarCredentials();
      if (credentials === undefined) {
        throw new Error(formatGoogleCalendarSetupHelp());
      }
      return listGoogleCalendarEvents(credentials, new Date(String(input?.start ?? '')), new Date(String(input?.end ?? '')));
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
      return createGoogleCalendarEvent(credentials, input);
    },
  });

  piclaw.registerCommand({
    name: 'calendar',
    description: 'Show Google Calendar status.',
    handler: () => formatGoogleCalendarStatus(),
  });

  piclaw.registerCommand({
    name: 'calendar-connect',
    description: 'Start Google Calendar OAuth setup.',
    handler: () => {
      const credentials = getCredentialsOrHelp();
      if (typeof credentials === 'string') {
        return credentials;
      }
      return [
        'Open this Google link and approve Calendar access:',
        createGoogleCalendarAuthUrl(credentials),
        '',
        'After approval, copy the final redirect URL or code and send:',
        '/calendar-code <redirect-url-or-code>',
      ].join('\n');
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
        await saveGoogleCalendarCode(credentials, input.args);
        return 'Google Calendar connected. Use /calendar-today or /calendar-week.';
      } catch (error) {
        return `Calendar connect failed: ${getErrorMessage(error)}`;
      }
    },
  });

  piclaw.registerCommand({
    name: 'calendar-disconnect',
    description: 'Disconnect Google Calendar.',
    handler: async () => {
      await disconnectGoogleCalendar();
      return 'Google Calendar disconnected.';
    },
  });

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
        return truncateText(formatGoogleCalendarEvents('today', await listGoogleCalendarEvents(credentials, start, end)), 3500);
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
        return truncateText(formatGoogleCalendarEvents('this week', await listGoogleCalendarEvents(credentials, start, end)), 3500);
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

        const created = await createEventFromDraft(credentials, draft);
        return `${formatCalendarAddPreview(draft)}\n\nNo callback-capable connector found. Creating now.\n${created}`;
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
        return await createEventFromDraft(credentials, draft);
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
