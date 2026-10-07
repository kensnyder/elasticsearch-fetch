import { describe, expect, it } from 'bun:test';
import { Client } from './client';
import * as generatedPresets from './generated/presets';
import {
  presetAsyncSearch,
  presetCrud,
  presetEql,
  presetEsql,
  presetIngest,
  presetSchema,
  presetSql,
  presetTasks,
} from './presets';

describe('preset definitions', () => {
  const allPresets = [
    { name: 'presetCrud', list: presetCrud },
    { name: 'presetSchema', list: presetSchema },
    { name: 'presetTasks', list: presetTasks },
    { name: 'presetIngest', list: presetIngest },
    { name: 'presetEql', list: presetEql },
    { name: 'presetEsql', list: presetEsql },
    { name: 'presetSql', list: presetSql },
    { name: 'presetAsyncSearch', list: presetAsyncSearch },
  ];

  for (const { name, list } of allPresets) {
    it(`${name} contains a non-empty list of unique endpoint names`, () => {
      expect(Array.isArray(list)).toBe(true);
      expect(list.length).toBeGreaterThan(0);

      const uniqueSet = new Set(list);
      expect(uniqueSet.size).toBe(list.length);

      for (const endpoint of list) {
        expect(typeof endpoint).toBe('string');
        expect(endpoint.trim().length).toBeGreaterThan(0);
        // Valid identifier or dotted identifier (e.g. 'search', 'indices.create')
        expect(
          /^[a-zA-Z][a-zA-Z0-9]*(\.[a-zA-Z][a-zA-Z0-9]*)*$/.test(endpoint)
        ).toBe(true);
      }
    });
  }
});

describe('generated presets integration', () => {
  it('exports preset objects with functional endpoint handlers', () => {
    expect(generatedPresets.presetCrud).toBeDefined();
    expect(typeof generatedPresets.presetCrud.search).toBe('function');
    expect(typeof generatedPresets.presetCrud.bulk).toBe('function');

    expect(generatedPresets.presetTasks).toBeDefined();
    expect(typeof generatedPresets.presetTasks['tasks.list']).toBe('function');
  });

  it('instantiates Client with preset objects and binds methods correctly', () => {
    const client = new Client(
      { node: 'http://localhost:9200' },
      {
        ...generatedPresets.presetCrud,
        ...generatedPresets.presetTasks,
      }
    );

    expect(typeof client.search).toBe('function');
    expect(typeof client.bulk).toBe('function');
    expect(typeof client.tasks?.list).toBe('function');
    expect(typeof client.tasks?.get).toBe('function');
  });
});
