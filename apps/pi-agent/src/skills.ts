import { loadSkills } from '@earendil-works/pi-coding-agent';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import { escapeTelegramHtml } from './format';
import { getPiAgentDir } from './storage';

export type SkillSummary = {
  name: string;
  description: string;
};

export const getAvailableSkillSummaries = (rootPath: string): SkillSummary[] => {
  const skillPaths: string[] = [];
  const agentsSkillsDir = resolve(rootPath, '.agents', 'skills');

  if (existsSync(agentsSkillsDir)) {
    skillPaths.push(agentsSkillsDir);
  }

  const result = loadSkills({
    cwd: rootPath,
    agentDir: getPiAgentDir(),
    skillPaths,
    includeDefaults: true,
  });

  return result.skills
    .map((skill) => ({
      name: skill.name,
      description: skill.description,
    }))
    .sort((left, right) => left.name.localeCompare(right.name));
};

export const formatSkillsList = (rootPath: string): string => {
  const skills = getAvailableSkillSummaries(rootPath);

  if (skills.length === 0) {
    return 'No skills found.';
  }

  return ['Available skills:', '', skills.map((skill) => `${skill.name}\n  ${skill.description}`).join('\n\n')].join('\n');
};

export const formatSkillsTelegramHtml = (rootPath: string): string => {
  const skills = getAvailableSkillSummaries(rootPath);

  if (skills.length === 0) {
    return 'No skills found.';
  }

  return [
    'Available skills:',
    '',
    skills
      .map((skill) => [
        `<b>${escapeTelegramHtml(skill.name)}</b>`,
        `<pre>${escapeTelegramHtml(skill.description)}</pre>`,
      ].join('\n'))
      .join('\n\n'),
  ].join('\n');
};

export const formatSkillsStatusList = (rootPath: string): string => {
  const skills = getAvailableSkillSummaries(rootPath);

  if (skills.length === 0) {
    return 'Skills:\n  none';
  }

  return ['Skills:', ...skills.map((skill) => `  - ${skill.name}\n    ${skill.description}`)].join('\n');
};
