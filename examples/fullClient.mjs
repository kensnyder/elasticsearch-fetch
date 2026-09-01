import { Client } from '../dist/index.mjs';

const client = new Client({ node: 'http://localhost:9200' });
console.log(await client.count());
