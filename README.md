# elasticsearch-fetch

[![NPM Link](https://badgen.net/npm/v/elasticsearch-fetch?v=0.9.0&cb=1)](https://npmjs.com/package/elasticsearch-fetch)
[![Language](https://badgen.net/static/language/TS?v=0.9.0&cb=1)](https://github.com/search?q=repo:kensnyder/elasticsearch-fetch++language:TypeScript&type=code)
[![Build Status](https://github.com/kensnyder/elasticsearch-fetch/actions/workflows/workflow.yml/badge.svg?v=0.9.0&cb=1)](https://github.com/kensnyder/elasticsearch-fetch/actions)
[![Code Coverage](https://codecov.io/gh/kensnyder/elasticsearch-fetch/branch/main/graph/badge.svg?v=0.9.0&cb=1)](https://codecov.io/gh/kensnyder/elasticsearch-fetch)
[![Gzipped Size](https://badgen.net/static/minzipped/3kb/green?v=0.9.0&cb=1)](https://bundlephobia.com/package/elasticsearch-fetch@0.9.0)
[![Tree Shakeable](https://badgen.net/static/tree%20shakeable/yes/green?v=0.9.0&cb=1)](https://bundlephobia.com/package/elasticsearch-fetch@0.9.0)
[![Dependency details](https://badgen.net/static/dependencies/0/green?v=0.9.0&cb=1)](https://www.npmjs.com/package/elasticsearch-fetch?activeTab=dependencies)
[![ISC License](https://badgen.net/github/license/kensnyder/elasticsearch-fetch?v=0.9.0&cb=1)](https://opensource.org/licenses/ISC)

`elasticsearch-fetch` is a lightweight, fetch-based alternative to the heavy Elasticsearch SDK
(on npm as `@elastic/elasticsearch`). It works on any runtime that supports fetch
including Node, Deno, Bun and Worker runtimes.

```bash
npm install elasticsearch-fetch
```

## Usage

```ts
import { Client } from 'elasticsearch-fetch';

const client = new Client({
  node: 'http://localhost:9200',
  auth: {
    username: process.env.ES_USERNAME,
    password: process.env.ES_PASSWORD,
  },
});

await client.indices.create({
  index: 'tweets',
  operations: {
    mappings: {
      properties: {
        id: { type: 'integer' },
        text: { type: 'text' },
        user: { type: 'keyword' },
        time: { type: 'date' }
      }
    }
  }
}, { ignore: [400] });

const bulkResponse = await client.bulk({ refresh: true, operations });
const count = await client.count({ index: 'tweets' });
```

## Contributions and local development

[Bun](https://bun.sh) is required for testing and building the `elasticsearch-fetch` package.
