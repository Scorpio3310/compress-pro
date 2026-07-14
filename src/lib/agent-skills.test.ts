import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
	SKILL_DESCRIPTION,
	SKILL_MD,
	SKILL_NAME,
	SKILL_PATH,
	skillsIndexJson
} from './agent-skills';
import { GET as getIndex } from '../routes/.well-known/agent-skills/index.json/+server';
import { GET as getSkill } from '../routes/.well-known/agent-skills/using-compress-pro/SKILL.md/+server';

describe('agent-skills discovery', () => {
	it('index.json follows the RFC v0.2.0 shape', async () => {
		const index = JSON.parse(await skillsIndexJson());
		expect(index.$schema).toBe('https://schemas.agentskills.io/discovery/0.2.0/schema.json');
		const [skill, ...rest] = index.skills;
		expect(rest).toEqual([]);
		expect(skill.name).toBe(SKILL_NAME);
		expect(skill.name).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
		expect(skill.name.length).toBeLessThanOrEqual(64);
		expect(skill.type).toBe('skill-md');
		expect(skill.description.length).toBeLessThanOrEqual(1024);
		expect(skill.url).toBe(SKILL_PATH);
	});

	it('digest is the sha256 of the exact SKILL.md bytes', async () => {
		const index = JSON.parse(await skillsIndexJson());
		const expected = `sha256:${createHash('sha256').update(SKILL_MD).digest('hex')}`;
		expect(index.skills[0].digest).toBe(expected);
	});

	it('SKILL.md frontmatter matches the index entry', () => {
		expect(
			SKILL_MD.startsWith(`---\nname: ${SKILL_NAME}\ndescription: ${SKILL_DESCRIPTION}\n---\n`)
		).toBe(true);
	});

	it('the .well-known endpoints serve exactly the module output', async () => {
		const index = await getIndex();
		expect(index.headers.get('Content-Type')).toBe('application/json; charset=utf-8');
		expect(await index.text()).toBe(await skillsIndexJson());

		const skill = getSkill();
		expect(skill.headers.get('Content-Type')).toBe('text/markdown; charset=utf-8');
		expect(await skill.text()).toBe(SKILL_MD);
	});
});
