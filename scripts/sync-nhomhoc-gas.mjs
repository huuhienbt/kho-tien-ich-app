import { readFile, appendFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { Script } from 'node:vm';
import { pathToFileURL } from 'node:url';

export const REQUIRED_SECRETS = [
  'GAS_SCRIPT_ID', 'GAS_DEPLOYMENT_ID', 'GAS_OAUTH_CLIENT_ID',
  'GAS_OAUTH_CLIENT_SECRET', 'GAS_OAUTH_REFRESH_TOKEN'
];
const API = 'https://script.googleapis.com/v1/projects/';

// Only writable File fields are sent back. Never log project content or credentials.
export function filesOf(content) {
  if (!Array.isArray(content?.files) || !content.files.length) throw new Error('PROJECT_FILES_INVALID');
  const seen = new Set();
  const files = content.files.map(({ name, type, source }) => {
    if (typeof name !== 'string' || !name || seen.has(name) ||
        !['SERVER_JS', 'HTML', 'JSON'].includes(type) || typeof source !== 'string') {
      throw new Error('PROJECT_FILES_INVALID');
    }
    seen.add(name);
    return { name, type, source };
  });
  const manifest = files.find(f => f.name === 'appsscript' && f.type === 'JSON');
  if (!manifest || !files.some(f => f.name === 'Code' && f.type === 'SERVER_JS')) {
    throw new Error('EGV_PROJECT_FILES_MISSING');
  }
  try { JSON.parse(manifest.source); } catch { throw new Error('PROJECT_MANIFEST_INVALID'); }
  return files;
}

export function replaceNhomHoc(files, source) {
  if (typeof source !== 'string' || !source.trim()) throw new Error('LOCAL_SOURCE_INVALID');
  try { new Script(source, { filename: 'NhomHoc.gs' }); } catch { throw new Error('LOCAL_SOURCE_INVALID'); }
  const old = files.find(f => f.name === 'NhomHoc');
  if (old && old.type !== 'SERVER_JS') throw new Error('NHOMHOC_FILE_TYPE_INVALID');
  const next = files.map(f => ({ ...f }));
  const replacement = { name: 'NhomHoc', type: 'SERVER_JS', source };
  if (old) next[next.findIndex(f => f.name === 'NhomHoc')] = replacement;
  else next.push(replacement);
  return next;
}

function fingerprint(files) {
  const sorted = [...files].sort((a, b) => a.name.localeCompare(b.name));
  return createHash('sha256').update(JSON.stringify(sorted)).digest('hex');
}

function webUrl(deployment, scriptId, deploymentId) {
  const config = deployment?.deploymentConfig;
  const url = deployment?.entryPoints?.find(e => e.entryPointType === 'WEB_APP')?.webApp?.url;
  if (deployment?.deploymentId !== deploymentId || config?.scriptId !== scriptId ||
      !Number.isInteger(config?.versionNumber) || config.versionNumber < 1 ||
      config.manifestFileName !== 'appsscript' || typeof url !== 'string') {
    throw new Error('DEPLOYMENT_INVALID');
  }
  return url;
}

// Error codes are fixed: raw OAuth/API response messages can contain sensitive values.
async function request(fetchImpl, url, options, stage) {
  let response;
  try {
    response = await fetchImpl(url, { ...options, signal: AbortSignal.timeout(30000) });
  } catch { throw new Error(`${stage}_NETWORK_OR_TIMEOUT`); }
  if (!response.ok) {
    const status = Number.isInteger(response.status) ? response.status : 0;
    throw new Error(`${stage}_HTTP_${status}`);
  }
  try { return await response.json(); } catch { throw new Error(`${stage}_RESPONSE_INVALID`); }
}

export async function syncNhomHoc({ env, source, expectedUrl, fetchImpl = fetch, report = () => {} }) {
  if (REQUIRED_SECRETS.some(key => !env[key]?.trim())) throw new Error('GITHUB_SECRETS_MISSING');
  const scriptId = env.GAS_SCRIPT_ID.trim();
  const deploymentId = env.GAS_DEPLOYMENT_ID.trim();
  if (!/^[\w-]+$/.test(scriptId) || !/^[\w-]+$/.test(deploymentId)) throw new Error('GAS_IDS_INVALID');
  if (!/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(expectedUrl || '') ||
      expectedUrl.split('/')[5] !== deploymentId) throw new Error('WEB_APP_URL_MISMATCH');
  // Validate local code before authenticating or performing any remote write.
  replaceNhomHoc([], source);
  const auth = await request(fetchImpl, 'https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'refresh_token',
      client_id: env.GAS_OAUTH_CLIENT_ID, client_secret: env.GAS_OAUTH_CLIENT_SECRET,
      refresh_token: env.GAS_OAUTH_REFRESH_TOKEN })
  }, 'OAUTH');
  if (typeof auth.access_token !== 'string' || !auth.access_token) throw new Error('OAUTH_TOKEN_MISSING');
  const root = API + encodeURIComponent(scriptId);
  const headers = { Authorization: `Bearer ${auth.access_token}`, 'Content-Type': 'application/json' };
  const get = (path, stage) => request(fetchImpl, root + path, { method: 'GET', headers }, stage);
  const write = (path, method, body, stage) => request(fetchImpl, root + path,
    { method, headers, body: JSON.stringify(body) }, stage);
  const depPath = '/deployments/' + encodeURIComponent(deploymentId);
  const deployment = await get(depPath, 'READ_DEPLOYMENT');
  const originalUrl = webUrl(deployment, scriptId, deploymentId);
  if (originalUrl !== expectedUrl) throw new Error('WEB_APP_URL_MISMATCH');
  const previousVersion = deployment.deploymentConfig.versionNumber;
  const before = filesOf(await get('/content', 'READ_CONTENT'));
  const desired = replaceNhomHoc(before, source);
  const desiredHash = fingerprint(desired);
  const published = filesOf(await get(`/content?versionNumber=${previousVersion}`, 'READ_PUBLISHED_CONTENT'));
  if (fingerprint(before) === desiredHash && fingerprint(published) === desiredHash) {
    return { status: 'unchanged', version: previousVersion, previousVersion };
  }
  // Detect manual changes before replacing the entire project (API has no atomic compare-and-swap).
  const latest = filesOf(await get('/content', 'RECHECK_CONTENT'));
  const latestDep = await get(depPath, 'RECHECK_DEPLOYMENT');
  if (fingerprint(latest) !== fingerprint(before) ||
      webUrl(latestDep, scriptId, deploymentId) !== originalUrl ||
      latestDep.deploymentConfig.versionNumber !== previousVersion) throw new Error('REMOTE_CHANGED_RETRY');
  await report({ previousVersion });
  if (fingerprint(before) !== desiredHash) {
    await write('/content', 'PUT', { files: desired }, 'UPDATE_CONTENT');
  }
  if (fingerprint(filesOf(await get('/content', 'VERIFY_CONTENT'))) !== desiredHash) {
    throw new Error('CONTENT_VERIFICATION_FAILED');
  }
  const sha = /^[a-f0-9]{40}$/.test(env.GITHUB_SHA || '') ? env.GITHUB_SHA.slice(0, 12) : 'manual';
  const description = `E-GV NhomHoc ${sha}`;
  const version = await write('/versions', 'POST', { description }, 'CREATE_VERSION');
  if (!Number.isInteger(version.versionNumber) || version.versionNumber < 1) throw new Error('VERSION_INVALID');
  // Verify the immutable snapshot before making it live.
  if (fingerprint(filesOf(await get(`/content?versionNumber=${version.versionNumber}`, 'VERIFY_VERSION'))) !== desiredHash) {
    throw new Error('VERSION_VERIFICATION_FAILED');
  }
  const preDeploy = await get(depPath, 'PREDEPLOY_CHECK');
  if (webUrl(preDeploy, scriptId, deploymentId) !== originalUrl ||
      preDeploy.deploymentConfig.versionNumber !== previousVersion) throw new Error('REMOTE_DEPLOYMENT_CHANGED');
  await write(depPath, 'PUT', { deploymentConfig: { scriptId, versionNumber: version.versionNumber,
    manifestFileName: 'appsscript', description } }, 'UPDATE_DEPLOYMENT');
  const final = await get(depPath, 'VERIFY_DEPLOYMENT');
  if (webUrl(final, scriptId, deploymentId) !== originalUrl ||
      final.deploymentConfig.versionNumber !== version.versionNumber) throw new Error('DEPLOYMENT_VERIFICATION_FAILED');
  return { status: 'deployed', version: version.versionNumber, previousVersion };
}

async function main() {
  const source = await readFile(new URL('../NhomHoc.gs', import.meta.url), 'utf8');
  const config = await readFile(new URL('../js/config.js', import.meta.url), 'utf8');
  const expectedUrl = config.match(/API_URL\s*:\s*['"](https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec)['"]/)?.[1];
  const result = await syncNhomHoc({ env: process.env, source, expectedUrl, report: async ({ previousVersion }) => {
    const note = `Phiên bản Web App trước khi đồng bộ: ${previousVersion}.`;
    console.log(note);
    if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, note + '\n');
  } });
  const message = result.status === 'unchanged'
    ? `NhomHoc.gs đã đồng bộ; phiên bản ${result.version} đang hoạt động.`
    : `Đã cập nhật NhomHoc.gs và triển khai phiên bản ${result.version}. URL Web App được giữ nguyên. Phiên bản trước: ${result.previousVersion}.`;
  console.log(message);
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, message + '\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(async error => {
    const safe = /^(?:[A-Z_]+(?:_\d+)?)$/.test(error.message) ? error.message : 'SYNC_FAILED';
    const message = `Đồng bộ chưa hoàn tất: ${safe}. Xem HUONG_DAN_TU_DONG_NHOMHOC_GAS.md. Có thể chạy lại sau khi sửa lỗi; kiểm tra Actions trước khi sử dụng bản mới.`;
    console.error(message);
    if (process.env.GITHUB_STEP_SUMMARY) {
      await appendFile(process.env.GITHUB_STEP_SUMMARY, message + '\n').catch(() => {});
    }
    process.exitCode = 1;
  });
}
