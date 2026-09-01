# elasticsearch-fetch

[![NPM Link](https://badgen.net/npm/v/elasticsearch-fetch?v=0.9.0&cb=1)](https://npmjs.com/package/elasticsearch-fetch)
[![Language](https://badgen.net/static/language/TS?v=0.9.0&cb=1)](https://github.com/search?q=repo:kensnyder/elasticsearch-fetch++language:TypeScript&type=code)
[![Build Status](https://github.com/kensnyder/elasticsearch-fetch/actions/workflows/workflow.yml/badge.svg?v=0.9.0&cb=1)](https://github.com/kensnyder/elasticsearch-fetch/actions)
[![Code Coverage](https://codecov.io/gh/kensnyder/elasticsearch-fetch/branch/main/graph/badge.svg?v=0.9.0&cb=1)](https://codecov.io/gh/kensnyder/elasticsearch-fetch)
![Gzipped Size](https://badgen.net/static/minzipped/4kb–21kb/green?v=0.9.0&cb=1)
![Tree Shakeable](https://badgen.net/static/tree%20shakeable/yes/green?v=0.9.0&cb=1)
[![ISC License](https://badgen.net/github/license/kensnyder/elasticsearch-fetch?v=0.9.0&cb=1)](https://opensource.org/licenses/ISC)

`elasticsearch-fetch` is a 11 times smaller fetch-based alternative to the Elasticsearch SDK (on npm as `@elastic/elasticsearch`). It works on any runtime that supports fetch including Node, Deno, Bun and Edge Worker runtimes.

```bash
npm install elasticsearch-fetch
```

## Usage

There are three ways to use elasticsearch-fetch depending on whether you prefer
compatibility or build size.

Your build of `elasticsearch-fetch` can range anywhere between 4kb and 21kb minzipped. But compare that to `@elastic/elasticsearch`'s build size of 257kb minzipped. That's a bundle size savings of 92% to 98%!

### Option 1 - Full SDK - 21kb minzipped

You can use `elasticsearch-fetch` with all 567 of the operations available in the `@elastic/elasticearch` SDK:

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

### Option 2 - Tree-shaken: your build includes only what you use

```ts
import { createTransport, create, bulk, count } from 'elasticsearch-fetch/functions';

const tx = createTransport({
  node: 'http://localhost:9200',
  auth: {
    username: process.env.ES_USERNAME,
    password: process.env.ES_PASSWORD,
  },
});

await create(tx, {
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

const bulkResponse = await bulk(tx, { refresh: true, operations });
const count = await count(tx, { index: 'tweets' });
```

### Option 3 (Recommended) - Custom SDK: build your own client from presets and/or individual endpoints

Register exactly the endpoints you want, and `client` is typed to match ­— only the
registered methods autocomplete and type-check.

```ts
import { Client, presetCrud, presetEql } from 'elasticsearch-fetch/presets';
import { clusterHealth, clusterInfo } from 'elasticsearch-fetch/functions';

const client = new Client(
  {
    node: 'http://localhost:9200',
    auth: {
      username: process.env.ES_USERNAME,
      password: process.env.ES_PASSWORD,
    },
  },
  {
    ...presetCrud,
    ...presetEql,
    'cluster.health': clusterHealth,
    'cluster.info': clusterInfo,
  }
);

await client.bulk({ refresh: true, operations });
await client.eql.search({ index: 'tweets', query: 'process where true' });
await client.cluster.health();
```

You can also register additional endpoints after construction with
`client.register({ ... })`, though methods added this way won't be reflected
in `client`'s TypeScript type.

#### Presets

Import any combination of the following from `elasticsearch-fetch/presets`

- presetCrud - All 39 CRUD operations
- presetSchema - `info`, all 27 `cat.*` operations, and all 71 `indices.*` operations
- presetTasks - all 3 `tasks.*` operations
- presetIngest - all 5 `injest.*` operations
- presetEql - all 4 `eql.*` operations
- presetEsql - all 15 `esql.*` operations
- presetSql - all 6 `sql.*` operations
- presetAsyncSearch - all 4 `asyncSearch.*` operations

#### Example build sizes:

- Monlithic @elastic/elasticsearch - 257kb
- Full elasticsearch-fetch - 21kb
- presetCrud - 4kb
- presetCrud + presetSchema - 7kb

## Auth Options

You can specify auth in 7 different ways

1. `auth: undefined` - Server requires no auth
2. `auth: { username: 'user', password: 'pass' }` - Username and password
3. `auth: { bearer: 'abc123' }` - Bearer token
4. `auth: { apiKey: 'abc123' }` - API Key
5. `process.env.ELASTICSEARCH_USERNAME && process.env.ELASTICSEARCH_PASSWORD` - Env vars for username and password
6. `process.env.ELASTICSEARCH_BEARER` - Env var for bearer token
7. `process.env.ELASTICSEARCH_API_KEY` - Env var for API key

## Docs

For a list of all methods will associated links to Elasticsearch's online documentation see one of the following:

- [SDK methods](./docs/API.md)
- [Functions](./docs/functions.md)

## How it works

Elasticsearch releases a schema file on GitHub that includes all server methods. They generate the JavaScript SDK programmatically based on that schema. Each generated function includes runtime validation which takes up a lot of space. For instance the source code of `bulk` is 2768 bytes in `@elastic/elasticsearch`, but 365 bytes in `elasticsearch-fetch/functions`.

So `elasticsearch-fetch` includes a small fetch-based transport layer instead of the node-networking transport layer of `@elastic/elasticsearch`. But it also builds its dist from Elasticsearch's own schema file.

## Contributions and local development

[Bun](https://bun.sh) is required for testing and building the `elasticsearch-fetch` package.
