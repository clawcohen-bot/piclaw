import {
  addWikiNote,
  formatWikiOpen,
  formatWikiSearchResults,
  formatWikiStatus,
  searchWiki,
} from '../../../apps/piclaw/src/features/wiki/wiki';
import { getErrorMessage } from '../../../apps/piclaw/src/core/error';
import { truncateText } from '../../../apps/piclaw/src/messages/text';

const source = 'telegram';

export default function (piclaw: any) {
  piclaw.registerTool({
    name: 'wiki.add-note',
    description: 'Add a note to the Piclaw Obsidian wiki.',
    handler: async (input: any) => addWikiNote(String(input?.text ?? ''), String(input?.source ?? source)),
  });

  piclaw.registerTool({
    name: 'wiki.search',
    description: 'Search the Piclaw Obsidian wiki.',
    handler: async (input: any) => searchWiki(String(input?.query ?? '')),
  });

  piclaw.registerCommand({
    name: 'wiki',
    description: 'Show wiki status.',
    handler: () => formatWikiStatus(),
  });

  piclaw.registerCommand({
    name: 'wiki-add',
    description: 'Add text to the wiki inbox.',
    handler: async (input: any) => {
      if (input.args.length === 0) {
        return 'Use /wiki-add <text>';
      }

      try {
        const result = await addWikiNote(input.args, source);
        return `Added to Obsidian wiki.\nInbox: ${result.inboxPath}\nRaw: ${result.rawPath}`;
      } catch (error) {
        return `Wiki add failed: ${getErrorMessage(error)}`;
      }
    },
  });

  piclaw.registerCommand({
    name: 'wiki-search',
    description: 'Search the wiki.',
    handler: async (input: any) => truncateText(formatWikiSearchResults(input.args, await searchWiki(input.args)), 3500),
  });

  piclaw.registerCommand({
    name: 'wiki-open',
    description: 'Find the best matching wiki page.',
    handler: async (input: any) => formatWikiOpen(input.args),
  });
}
