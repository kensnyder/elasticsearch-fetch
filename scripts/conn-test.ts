import { Client } from '../index.ts';

const client = new Client();
try {
  const res = await client.bulk({
    operations: [{ id: 1, title: 'foo' }],
  });
  console.log('conn-test.ts res=', res);
} catch (error) {
  console.log('conn-test.ts error=', error);
}
