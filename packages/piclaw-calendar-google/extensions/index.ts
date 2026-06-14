export default function (piclaw: any) {
  piclaw.registerCommand({
    name: 'calendar-package-status',
    description: 'Show that the Google Calendar package is loaded.',
    handler: () => 'Calendar package loaded.',
  });
}
