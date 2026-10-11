import test from 'node:test';
import assert from 'node:assert/strict';
import { syncNhomHoc, filesOf, replaceNhomHoc, REQUIRED_SECRETS } from '../scripts/sync-nhomhoc-gas.mjs';

const env = Object.fromEntries(REQUIRED_SECRETS.map(key => [key, 'test-value']));
env.GAS_SCRIPT_ID = 'test-script';
env.GAS_DEPLOYMENT_ID = 'test-deployment';
env.GITHUB_SHA = 'a'.repeat(40);
const expectedUrl = 'https://script.google.com/macros/s/test-deployment/exec';
const source = 'function setupNhomHoc() { return "new"; }\n';
const original = [
  { name: 'Code', type: 'SERVER_JS', source: '// Existing customized login/API code\n', functionSet: {} },
  { name: 'appsscript', type: 'JSON', source: '{"timeZone":"Asia/Ho_Chi_Minh","oauthScopes":["keep-existing-scope"]}' },
  { name: 'PrivateTemplate', type: 'HTML', source: '<p>Keep this custom file</p>' },
  { name: 'Extra', type: 'SERVER_JS', source: '// Custom module' },
  { name: 'NhomHoc', type: 'SERVER_JS', source: '// Old group code' }
];
const copy = value => structuredClone(value);

function fixture(options = {}) {
  const state = { head: copy(options.head || original), version: 7, calls: [], mutations: [],
    snapshots: new Map([[7, copy(options.published || original)]]), count: {} };
  const deployment = () => ({ deploymentId: env.GAS_DEPLOYMENT_ID,
    deploymentConfig: { scriptId: env.GAS_SCRIPT_ID, versionNumber: state.version, manifestFileName: 'appsscript' },
    entryPoints: [{ entryPointType: 'WEB_APP', webApp: { url: expectedUrl } }] });
  const fetchImpl = async (url, init) => {
    const path = url === 'https://oauth2.googleapis.com/token' ? 'token' : url.replace(/^.*\/projects\/test-script/, '');
    const method = init.method;
    const key = `${method} ${path}`;
    state.calls.push(key);
    state.count[key] = (state.count[key] || 0) + 1;
    if (method !== 'GET' && path !== 'token') state.mutations.push(key);
    options.before?.({ path, method, state });
    if (options.fail === key) return { ok: false, status: options.status || 403, json: async () => ({ secret: 'DO_NOT_EXPOSE' }) };
    let data;
    if (path === 'token') data = { access_token: 'fake-access-token' };
    else if (path === '/content' && method === 'GET') data = { files: copy(state.head) };
    else if (path === '/content' && method === 'PUT') {
      state.head = JSON.parse(init.body).files;
      data = { files: copy(state.head) };
    } else if (path.startsWith('/content?versionNumber=')) {
      const number = Number(path.split('=')[1]);
      data = { files: copy(state.snapshots.get(number)) };
    } else if (path === '/versions') {
      state.snapshots.set(8, copy(state.head));
      data = { versionNumber: 8 };
    } else if (path === '/deployments/test-deployment') {
      if (method === 'PUT') state.version = JSON.parse(init.body).deploymentConfig.versionNumber;
      data = deployment();
    } else throw new Error('Unexpected mock request');
    options.response?.({ path, method, state, data });
    return { ok: true, status: 200, json: async () => data };
  };
  const run = overrides => syncNhomHoc({ env, source, expectedUrl, fetchImpl, ...overrides });
  return { state, run };
}

test('replace only NhomHoc, preserve Code, custom modules, HTML and live manifest byte for byte', async () => {
  const { state, run } = fixture();
  assert.deepEqual(await run(), { status: 'deployed', previousVersion: 7, version: 8 });
  assert.deepEqual(state.head.filter(f => f.name !== 'NhomHoc'), filesOf({ files: original }).filter(f => f.name !== 'NhomHoc'));
  assert.equal(state.head.find(f => f.name === 'NhomHoc').source, source);
  assert.deepEqual(state.mutations, ['PUT /content', 'POST /versions', 'PUT /deployments/test-deployment']);
});

test('append NhomHoc when missing, without changing existing files', async () => {
  const { state, run } = fixture({ head: original.filter(f => f.name !== 'NhomHoc') });
  await run();
  assert.equal(state.head.length, original.length);
  assert.equal(state.head.at(-1).name, 'NhomHoc');
});

test('Vietnamese Mã.gs is preserved through upload, version and deployment', async () => {
  for (const name of ['Mã', 'Ma\u0303']) {
    const localized = original.map(f => f.name === 'Code' ? { ...f, name } : f);
    // Cover both localized and previously English-named deployed versions.
    for (const published of [localized, original]) {
      const { state, run } = fixture({ head: localized, published });
      assert.deepEqual(await run(), { status: 'deployed', previousVersion: 7, version: 8 });
      const preserved = filesOf({ files: localized }).filter(f => f.name !== 'NhomHoc');
      assert.deepEqual(state.head.filter(f => f.name !== 'NhomHoc'), preserved);
      assert.deepEqual(state.snapshots.get(8).filter(f => f.name !== 'NhomHoc'), preserved);
      assert.equal(state.head.some(f => f.name === 'Code'), false);
      assert.equal(state.head.find(f => f.name === 'NhomHoc').source, source);
    }
  }
});

test('identical live and published content is a no-op, even if file ordering differs', async () => {
  const matching = replaceNhomHoc(filesOf({ files: original }), source);
  const { state, run } = fixture({ head: matching, published: [...matching].reverse() });
  assert.equal((await run()).status, 'unchanged');
  assert.deepEqual(state.mutations, []);
});

test('rerun after code upload but failed deploy publishes new version without re-upload', async () => {
  const { state, run } = fixture({ head: replaceNhomHoc(filesOf({ files: original }), source) });
  assert.equal((await run()).status, 'deployed');
  assert.deepEqual(state.mutations, ['POST /versions', 'PUT /deployments/test-deployment']);
});

test('missing credentials and mismatched config URL stop before any request', async () => {
  const { state, run } = fixture();
  await assert.rejects(run({ env: {} }), /GITHUB_SECRETS_MISSING/);
  await assert.rejects(run({ expectedUrl: expectedUrl.replace('test-deployment', 'different') }), /WEB_APP_URL_MISMATCH/);
  await assert.rejects(run({ source: 'function {' }), /LOCAL_SOURCE_INVALID/);
  assert.deepEqual(state.calls, []);
});

test('wrong script deployment or missing Web App stops before code writes', async () => {
  for (const alter of [data => { data.deploymentConfig.scriptId = 'wrong'; },
    data => { data.entryPoints = []; }, data => { data.entryPoints[0].webApp.url += '?other'; }]) {
    const { state, run } = fixture({ response: ({ path, data }) => { if (path.startsWith('/deployments/')) alter(data); } });
    await assert.rejects(run(), /DEPLOYMENT_INVALID|WEB_APP_URL_MISMATCH/);
    assert.deepEqual(state.mutations, []);
  }
});

test('missing manifest, invalid JSON, missing backend and duplicate files are rejected', async () => {
  for (const files of [original.filter(f => f.name !== 'appsscript'), original.filter(f => f.name !== 'Code'),
    [...original, original[0]], original.map(f => f.name === 'appsscript' ? { ...f, source: '{' } : f)]) {
    const { state, run } = fixture({ head: files });
    await assert.rejects(run(), /PROJECT_|EGV_PROJECT/);
    assert.deepEqual(state.mutations, []);
  }
});

test('concurrent manual edit stops before uploading stale files', async () => {
  const { state, run } = fixture({ before: ({ path, method, state }) => {
    if (path === '/content' && method === 'GET' && state.count['GET /content'] === 2) state.head[0].source += '// edited';
  } });
  await assert.rejects(run(), /REMOTE_CHANGED_RETRY/);
  assert.deepEqual(state.mutations, []);
});

test('verification detects lost custom file and stops before version/deployment', async () => {
  const { state, run } = fixture({ before: ({ path, method, state }) => {
    if (path === '/content' && method === 'GET' && state.count['GET /content'] === 3) state.head = state.head.filter(f => f.name !== 'Extra');
  } });
  await assert.rejects(run(), /CONTENT_VERIFICATION_FAILED/);
  assert.deepEqual(state.mutations, ['PUT /content']);
});

test('snapshot mismatch blocks publishing even if HEAD upload verified', async () => {
  const { state, run } = fixture({ response: ({ path, data }) => {
    if (path === '/content?versionNumber=8') data.files[0].source += '// concurrent edit';
  } });
  await assert.rejects(run(), /VERSION_VERIFICATION_FAILED/);
  assert.deepEqual(state.mutations, ['PUT /content', 'POST /versions']);
});

test('manual deployment change during version creation blocks overwrite', async () => {
  const { state, run } = fixture({ before: ({ path, state }) => {
    if (path === '/content?versionNumber=8') state.version = 9;
  } });
  await assert.rejects(run(), /REMOTE_DEPLOYMENT_CHANGED/);
  assert.equal(state.version, 9);
  assert.ok(!state.mutations.includes('PUT /deployments/test-deployment'));
});

test('OAuth/API errors do not expose response body or credential values', async () => {
  for (const fail of ['POST token', 'PUT /content', 'POST /versions', 'PUT /deployments/test-deployment']) {
    const { state, run } = fixture({ fail });
    await assert.rejects(run(), error => {
      assert.match(error.message, /HTTP_403$/);
      assert.ok(!error.message.includes('DO_NOT_EXPOSE'));
      assert.ok(!error.message.includes('test-value'));
      return true;
    });
    const failedAt = state.calls.indexOf(fail);
    assert.equal(failedAt, state.calls.length - 1);
  }
});

test('final deployment verification must match both version and URL', async () => {
  const { run } = fixture({ response: ({ path, method, state, data }) => {
    if (path.startsWith('/deployments/') && method === 'GET' && state.version === 8) data.deploymentConfig.versionNumber = 7;
  } });
  await assert.rejects(run(), /DEPLOYMENT_VERIFICATION_FAILED/);
});
