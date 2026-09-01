import { Client, presetCrud, presetSchema } from '../dist/presets.mjs';

const client = new Client(
  { node: 'http://localhost:9200' },
  { ...presetCrud, ...presetSchema }
);
console.log(await client.count());
