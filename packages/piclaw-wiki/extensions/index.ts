export default function (piclaw: any) {
  piclaw.registerCommand({
    name: 'wiki-package-status',
    description: 'Show that the wiki package is loaded.',
    handler: () => 'Wiki package loaded.',
  });
}
