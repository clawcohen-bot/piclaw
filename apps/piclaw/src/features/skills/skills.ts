import { loadSkills } from '@earendil-works/pi-coding-agent';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve } from 'node:path';

import { escapeTelegramHtml } from '../../messages/format';
import { getPiSdkDir } from '../../core/storage';

export type SkillSummary = {
  name: string;
  description: string;
};

export const getSkillSearchPaths = (rootPath: string, extraPaths: string[] = []): string[] => {
  const candidates = [
    resolve(rootPath, '.piclaw', 'skills'),
    resolve(rootPath, '.agents', 'skills'),
    resolve(homedir(), '.piclaw', 'skills'),
    ...extraPaths,
  ];

  return [...new Set(candidates)].filter((path) => existsSync(path));
};

export const getAvailableSkillSummaries = (rootPath: string, extraPaths: string[] = []): SkillSummary[] => {
  const skillPaths = getSkillSearchPaths(rootPath, extraPaths);

  const result = loadSkills({
    cwd: rootPath,
    agentDir: getPiSdkDir(),
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

export const formatSkillsList = (rootPath: string, extraPaths: string[] = []): string => {
  const skills = getAvailableSkillSummaries(rootPath, extraPaths);

  if (skills.length === 0) {
    return 'No skills found.';
  }

  return ['Available skills:', '', skills.map((skill) => `${skill.name}\n  ${skill.description}`).join('\n\n')].join('\n');
};

export const formatSkillsTelegramHtml = (rootPath: string, extraPaths: string[] = []): string => {
  const skills = getAvailableSkillSummaries(rootPath, extraPaths);

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

export const formatSkillsStatusList = (rootPath: string, extraPaths: string[] = []): string => {
  const skills = getAvailableSkillSummaries(rootPath, extraPaths);

  if (skills.length === 0) {
    return 'Skills:\n  none';
  }

  return ['Skills:', ...skills.map((skill) => `  - ${skill.name}\n    ${skill.description}`)].join('\n');
};
