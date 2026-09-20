import fs from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve('tests/fixtures/generated-code-viewer');

await fs.rm(root, { recursive: true, force: true });
await fs.mkdir(root, { recursive: true });

for (let index = 0; index < 5000; index += 1) {
  const directory = path.join(root, `entry-${String(index).padStart(4, '0')}`);
  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(path.join(directory, 'README.md'), `workspace entry ${index}\n`);
}

for (let index = 0; index < 10000; index += 1) {
  const file = path.join(root, `search-${String(index).padStart(5, '0')}.txt`);
  await fs.writeFile(file, `searchable workspace fixture ${index}\n`);
}

console.log(`Generated fixture workspace at ${root}`);
