import { readFile, writeFile, readdir } from 'node:fs/promises';

const snapshots = {};
for (const name of await readdir('data')) {
  if (name.endsWith('.json')) snapshots[`./data/${name}`] = JSON.parse(await readFile(`data/${name}`, 'utf8'));
}
const embedded = JSON.stringify(snapshots).replace(/</g, '\\u003c');
const bootstrap = `<script>
// Offline snapshots retain original provenance and timestamps. HTTP always loads repository JSON.
if (location.protocol === 'file:') {
  const snapshots = ${embedded};
  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input, options) => {
    const path = String(input).split('?')[0];
    if (path.startsWith('./data/')) return new Response(JSON.stringify(snapshots[path] ?? null), {status: snapshots[path] ? 200 : 404, headers: {'Content-Type': 'application/json'}});
    return originalFetch(input, options);
  };
}
</script>`;
const html = await readFile('index.html', 'utf8');
await writeFile('standalone.html', html.replace('<!-- 2. Styles -->', `${bootstrap}\n  <!-- 2. Styles -->`));
console.log('Built standalone.html from index.html and data snapshots');
