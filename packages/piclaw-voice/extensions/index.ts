export default function (piclaw: any) {
  piclaw.registerCommand({
    name: 'voice-package-status',
    description: 'Show that the voice package is loaded.',
    handler: () => 'Voice package loaded.',
  });
}
