import { Client, presetCrud } from '../dist/presets.mjs';

const client = new Client({ node: 'http://localhost:9200' }, presetCrud);
console.log(await client.count());
