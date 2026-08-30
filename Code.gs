/**
 * E-GV - Apps Script backend
 * Không ghi mật khẩu hoặc API key trực tiếp trong tệp này.
 * Cấu hình tại Project Settings > Script Properties.
 */

const APP_ORIGIN = 'https://e-gv.vercel.app';
const PROMPT_HEADERS = ['id', 'title', 'category', 'content', 'platform', 'access', 'created_at'];
const REPAIR_HEADERS = ['id', 'date', 'task', 'location', 'cost', 'warranty', 'status', 'vendor', 'reporter', 'asset_id', 'image_url', 'note'];
const USER_HEADERS = ['id', 'name', 'email', 'password_hash', 'salt', 'provider', 'google_sub', 'status', 'created_at', 'last_login'];
const FAVORITE_HEADERS = ['user_id', 'prompt_id', 'created_at'];
const AGE_SCORE_MODEL_VERSION = 'egv-age-score-v5';
const AGE_ANALYSIS_VERSION = 'egv-age-analysis-v8';

function doGet(e) {
  try {
    const type = String((e && e.parameter && e.parameter.type) || 'prompts').toLowerCase();
    if (type === 'repairs') return createResponse({ status: 'success', data: getPublicRepairItems(), restricted: true });
    if (type !== 'prompts') return createResponse({ status: 'error', message: 'Loại dữ liệu không hợp lệ.' });

    ensureSheet('Prompts', PROMPT_HEADERS);
    const prompts = getSheetObjects('Prompts').reverse().map(function (item) {
      if (!isVipPrompt(item)) return item;
      const safeItem = Object.assign({}, item);
      setInsensitive(safeItem, 'content', '');
      safeItem.locked = true;
      return safeItem;
    });
    return createResponse({ status: 'success', data: prompts });
  } catch (error) {
    return createResponse({ status: 'error', message: safeError(error) });
  }
}

function getPublicRepairItems() {
  ensureSheet('Repairs', REPAIR_HEADERS);
  return getSheetObjects('Repairs').reverse().map(function (item) {
    return {
      id: String(readInsensitive(item, 'id') || ''),
      task: String(readInsensitive(item, 'task') || ''),
      status: String(readInsensitive(item, 'status') || '')
    };
  });
}

function doPost(e) {
  try {
    const payload = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    const action = String(payload.action || '').trim();
    const data = payload.data || {};

    if (action === 'verify') return handleAdminLogin(payload.adminPassword, payload.clientId);
    if (action === 'user_register') return handleUserRegister(data, payload.clientId);
    if (action === 'user_login') return handleUserLogin(data, payload.clientId);
    if (action === 'google_login') return handleGoogleLogin(data, payload.clientId);

    if (action === 'age_reading') {
      const principal = resolvePrincipal(payload);
      if (!principal) return createResponse({ status: 'error', message: 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.' });
      return handleAgeReading(data, payload.clientId);
    }

    if (action === 'get_prompts') {
      const principal = resolvePrincipal(payload);
      if (!principal) return createResponse({ status: 'error', message: 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.' });
      ensureSheet('Prompts', PROMPT_HEADERS);
      return createResponse({
        status: 'success',
        data: getSheetObjects('Prompts').reverse(),
        favorites: getFavoritePromptIds(principal)
      });
    }

    if (action === 'get_repairs') {
      const principal = resolvePrincipal(payload);
      if (!principal) return createResponse({ status: 'error', message: 'Vui lòng đăng nhập để xem chi tiết nhật ký sửa chữa.' });
      ensureSheet('Repairs', REPAIR_HEADERS);
      return createResponse({ status: 'success', data: getSheetObjects('Repairs').reverse(), restricted: false });
    }

    if (action === 'toggle_favorite') return handleToggleFavorite(payload, data);
    if (action === 'sync_favorites') return handleSyncFavorites(payload, data);

    if (action === 'upload') return handlePublicUpload(data, payload.clientId);
    if (action === 'getResumableUrl') return handleResumableUrl(data, payload.clientId);
    if (action === 'setPermission') return handleSetPermission(data, payload.clientId);

    if (action === 'generate_lesson_plan') {
      if (!isAdminPrincipal(payload)) return createResponse({ status: 'error', message: 'Phiên quản trị không hợp lệ hoặc đã hết hạn.' });
      return handleLessonPlan(data);
    }

    if (!isAdminPrincipal(payload)) return createResponse({ status: 'error', message: 'Phiên quản trị không hợp lệ hoặc đã hết hạn.' });
    if (action === 'create') return handleCreate(payload.sheetType, data);
    if (action === 'update') return handleUpdate(payload.sheetType, data);
    if (action === 'delete') return handleDelete(payload.sheetType, data);
    return createResponse({ status: 'error', message: 'Lệnh không hợp lệ.' });
  } catch (error) {
    return createResponse({ status: 'error', message: safeError(error) });
  }
}

/* ========================= CẤU HÌNH ========================= */

function getSetting(name, required, fallback) {
  const value = PropertiesService.getScriptProperties().getProperty(name);
  if (value) return value;
  if (required) throw new Error('Chưa cấu hình Script Property: ' + name);
  return fallback || '';
}

function getGeminiApiKeys() {
  const properties = PropertiesService.getScriptProperties();
  const names = ['GEMINI_API_KEY', 'GEMINI_API_KEY_2', 'GEMINI_API_KEY_3'];
  const keys = [];
  names.forEach(function (name) {
    const value = String(properties.getProperty(name) || '').trim();
    if (value && keys.indexOf(value) === -1) keys.push(value);
  });
  if (!keys.length) throw new Error('Chưa cấu hình Script Property: GEMINI_API_KEY');
  return keys;
}

function shouldTryNextGeminiKey(responseCode, result, message) {
  const status = String(result && result.error && result.error.status || '').toUpperCase();
  const detail = String(message || '').toUpperCase();
  if ([401, 403, 408, 429, 500, 502, 503, 504].indexOf(Number(responseCode)) !== -1) return true;
  if (['UNAUTHENTICATED', 'PERMISSION_DENIED', 'RESOURCE_EXHAUSTED', 'DEADLINE_EXCEEDED', 'INTERNAL', 'UNAVAILABLE'].indexOf(status) !== -1) return true;
  return /API[_ ]?KEY.*(?:INVALID|EXPIRED|REVOKED)|(?:INVALID|EXPIRED|REVOKED).*API[_ ]?KEY/.test(detail);
}

function setupApplication() {
  ensureSheet('Prompts', PROMPT_HEADERS);
  ensureSheet('Repairs', REPAIR_HEADERS);
  ensureSheet('Users', USER_HEADERS);
  ensureSheet('PromptFavorites', FAVORITE_HEADERS);
  const properties = PropertiesService.getScriptProperties();
  if (!properties.getProperty('TOKEN_SECRET')) {
    properties.setProperty('TOKEN_SECRET', Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, ''));
  }
  const required = ['ADMIN_PASSWORD', 'FOLDER_ID', 'GEMINI_API_KEY'];
  const missing = required.filter(function (key) { return !PropertiesService.getScriptProperties().getProperty(key); });
  if (missing.length) throw new Error('Cần thêm Script Properties: ' + missing.join(', '));
  return 'Đã chuẩn hóa các sheet và kiểm tra cấu hình.';
}

/* ========================= XÁC THỰC ========================= */

function handleAdminLogin(password, clientId) {
  enforceRateLimit(clientId, 'admin-login', 20);
  const expected = getSetting('ADMIN_PASSWORD', true);
  if (!password || !constantTimeEquals(String(password), expected)) {
    return createResponse({ status: 'error', message: 'Sai mật khẩu quản trị.' });
  }
  const token = issueToken({ sub: 'admin', role: 'admin', name: 'Thầy Hiển' }, 8 * 60 * 60);
  return createResponse({ status: 'success', adminToken: token, message: 'Đăng nhập thành công.' });
}

function handleUserRegister(data, clientId) {
  enforceRateLimit(clientId, 'register', 8);
  const name = cleanText(data.name, 120);
  const email = normalizeEmail(data.email);
  const password = String(data.password || '');
  if (name.length < 2) return createResponse({ status: 'error', message: 'Họ và tên chưa hợp lệ.' });
  if (!isValidEmail(email)) return createResponse({ status: 'error', message: 'Email chưa hợp lệ.' });
  if (password.length < 6) return createResponse({ status: 'error', message: 'Mật khẩu phải có ít nhất 6 ký tự.' });

  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const sheet = ensureSheet('Users', USER_HEADERS);
    if (findUserByEmail(email)) return createResponse({ status: 'error', message: 'Email này đã được đăng ký.' });
    const salt = Utilities.getUuid().replace(/-/g, '');
    const user = {
      id: 'USR-' + Date.now(), name: name, email: email,
      password_hash: hashPassword(password, salt), salt: salt,
      provider: 'password', google_sub: '', status: 'active',
      created_at: new Date().toISOString(), last_login: new Date().toISOString()
    };
    appendRecord(sheet, user);
    return userSessionResponse(user);
  } finally {
    lock.releaseLock();
  }
}

function handleUserLogin(data, clientId) {
  enforceRateLimit(clientId, 'login', 20);
  const email = normalizeEmail(data.email);
  const password = String(data.password || '');
  const found = findUserByEmail(email);
  if (!found || String(readInsensitive(found.data, 'status') || 'active') !== 'active') {
    return createResponse({ status: 'error', message: 'Email hoặc mật khẩu không đúng.' });
  }
  const storedHash = String(readInsensitive(found.data, 'password_hash') || '');
  const salt = String(readInsensitive(found.data, 'salt') || '');
  if (!storedHash || !constantTimeEquals(hashPassword(password, salt), storedHash)) {
    return createResponse({ status: 'error', message: 'Email hoặc mật khẩu không đúng.' });
  }
  updateRecordAtRow(found.sheet, found.row, { last_login: new Date().toISOString() });
  return userSessionResponse(found.data);
}

function handleGoogleLogin(data, clientId) {
  enforceRateLimit(clientId, 'google', 20);
  if (String(data.origin || '') !== APP_ORIGIN) return createResponse({ status: 'error', message: 'Tên miền đăng nhập không hợp lệ.' });
  const googleUser = verifyGoogleIdToken(String(data.credential || ''));

  const cachedUser = getCachedGoogleUser(googleUser.email);
  if (cachedUser) {
    const cachedSub = String(readInsensitive(cachedUser, 'google_sub') || '');
    if (!cachedSub || cachedSub === googleUser.sub) return userSessionResponse(cachedUser);
  }

  let found = findUserByEmail(googleUser.email);
  if (found) {
    const prepared = prepareExistingGoogleUser(found.data, googleUser);
    if (Object.keys(prepared.changes).length) {
      const updateLock = LockService.getScriptLock();
      if (updateLock.tryLock(2000)) {
        try {
          updateRecordAtRow(found.sheet, found.row, prepared.changes);
        } finally {
          updateLock.releaseLock();
        }
      }
    }
    putCachedGoogleUser(prepared.user);
    return userSessionResponse(prepared.user);
  }

  const createLock = LockService.getScriptLock();
  createLock.waitLock(5000);
  try {
    found = findUserByEmail(googleUser.email);
    if (found) {
      const prepared = prepareExistingGoogleUser(found.data, googleUser);
      if (Object.keys(prepared.changes).length) updateRecordAtRow(found.sheet, found.row, prepared.changes);
      putCachedGoogleUser(prepared.user);
      return userSessionResponse(prepared.user);
    }

    const sheet = ensureSheet('Users', USER_HEADERS);
    const now = new Date().toISOString();
    const user = {
      id: 'USR-' + Date.now(), name: googleUser.name || googleUser.email,
      email: googleUser.email, password_hash: '', salt: '', provider: 'google',
      google_sub: googleUser.sub, status: 'active', created_at: now, last_login: now
    };
    appendRecord(sheet, user);
    putCachedGoogleUser(user);
    return userSessionResponse(user);
  } finally {
    createLock.releaseLock();
  }
}

function prepareExistingGoogleUser(user, googleUser) {
  const status = String(readInsensitive(user, 'status') || 'active').toLowerCase();
  if (status !== 'active') throw new Error('Tài khoản này đang bị khóa.');

  const storedSub = String(readInsensitive(user, 'google_sub') || '');
  if (storedSub && storedSub !== googleUser.sub) throw new Error('Tài khoản Google không khớp với tài khoản đã lưu.');

  const merged = Object.assign({}, user);
  const changes = {};
  const storedName = String(readInsensitive(user, 'name') || '');
  const loginTime = Date.parse(String(readInsensitive(user, 'last_login') || ''));
  const shouldUpdateLoginTime = !isFinite(loginTime) || Date.now() - loginTime > 30 * 60 * 1000;

  if (!storedName && googleUser.name) {
    merged.name = googleUser.name;
    changes.name = googleUser.name;
  }
  if (!storedSub) {
    merged.google_sub = googleUser.sub;
    changes.google_sub = googleUser.sub;
  }
  if (shouldUpdateLoginTime) {
    merged.last_login = new Date().toISOString();
    changes.last_login = merged.last_login;
  }
  return { user: merged, changes: changes };
}

function googleCacheKey(prefix, value) {
  const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(value || ''), Utilities.Charset.UTF_8);
  return prefix + Utilities.base64EncodeWebSafe(digest).replace(/=+$/g, '').slice(0, 40);
}

function getCachedGoogleUser(email) {
  try {
    const value = CacheService.getScriptCache().get(googleCacheKey('google-user:', normalizeEmail(email)));
    if (!value) return null;
    const user = JSON.parse(value);
    return String(readInsensitive(user, 'status') || 'active').toLowerCase() === 'active' ? user : null;
  } catch (_) {
    return null;
  }
}

function putCachedGoogleUser(user) {
  try {
    const safeUser = {
      id: String(readInsensitive(user, 'id') || ''),
      name: String(readInsensitive(user, 'name') || ''),
      email: normalizeEmail(readInsensitive(user, 'email')),
      google_sub: String(readInsensitive(user, 'google_sub') || ''),
      status: String(readInsensitive(user, 'status') || 'active'),
      last_login: String(readInsensitive(user, 'last_login') || '')
    };
    if (safeUser.id && safeUser.email) {
      CacheService.getScriptCache().put(googleCacheKey('google-user:', safeUser.email), JSON.stringify(safeUser), 300);
    }
  } catch (_) {}
}

function verifyGoogleIdToken(credential) {
  if (!credential) throw new Error('Thiếu Google ID token.');
  const clientId = getSetting('GOOGLE_CLIENT_ID', true);
  const cache = CacheService.getScriptCache();
  const cacheKey = googleCacheKey('google-token:', credential);
  try {
    const cached = cache.get(cacheKey);
    if (cached) {
      const value = JSON.parse(cached);
      if (value.aud === clientId && Number(value.exp || 0) > Math.floor(Date.now() / 1000)) {
        return { sub: String(value.sub), email: normalizeEmail(value.email), name: cleanText(value.name || value.email, 120) };
      }
    }
  } catch (_) {}

  const response = UrlFetchApp.fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(credential), { muteHttpExceptions: true });
  if (response.getResponseCode() !== 200) throw new Error('Google ID token không hợp lệ.');
  const token = JSON.parse(response.getContentText());
  const issuerValid = token.iss === 'accounts.google.com' || token.iss === 'https://accounts.google.com';
  const notExpired = Number(token.exp || 0) > Math.floor(Date.now() / 1000);
  const emailVerified = token.email_verified === true || token.email_verified === 'true';
  if (token.aud !== clientId || !issuerValid || !notExpired || !emailVerified || !token.sub || !token.email) {
    throw new Error('Không thể xác minh tài khoản Google.');
  }
  const googleUser = { sub: String(token.sub), email: normalizeEmail(token.email), name: cleanText(token.name || token.email, 120) };
  try {
    const ttl = Math.max(1, Math.min(300, Number(token.exp) - Math.floor(Date.now() / 1000)));
    cache.put(cacheKey, JSON.stringify({
      sub: googleUser.sub, email: googleUser.email, name: googleUser.name,
      aud: String(token.aud), exp: Number(token.exp)
    }), ttl);
  } catch (_) {}
  return googleUser;
}

function userSessionResponse(user) {
  const profile = {
    id: String(readInsensitive(user, 'id') || ''),
    name: String(readInsensitive(user, 'name') || ''),
    email: normalizeEmail(readInsensitive(user, 'email'))
  };
  const token = issueToken({ sub: profile.id, role: 'member', name: profile.name, email: profile.email }, 7 * 24 * 60 * 60);
  return createResponse({ status: 'success', userToken: token, user: profile });
}

function resolvePrincipal(payload) {
  if (payload.adminToken) {
    const admin = verifyToken(payload.adminToken, 'admin');
    if (admin) return admin;
  }
  if (payload.userToken) return verifyToken(payload.userToken, 'member');
  return null;
}

function isAdminPrincipal(payload) {
  return Boolean(payload && payload.adminToken && verifyToken(payload.adminToken, 'admin'));
}

function issueToken(claims, ttlSeconds) {
  const payload = Object.assign({}, claims, {
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + ttlSeconds,
    nonce: Utilities.getUuid()
  });
  const encoded = base64WebSafe(Utilities.newBlob(JSON.stringify(payload)).getBytes());
  return encoded + '.' + signValue(encoded);
}

function verifyToken(token, requiredRole) {
  try {
    const parts = String(token || '').split('.');
    if (parts.length !== 2 || !constantTimeEquals(signValue(parts[0]), parts[1])) return null;
    const payload = JSON.parse(Utilities.newBlob(Utilities.base64DecodeWebSafe(parts[0])).getDataAsString());
    if (Number(payload.exp || 0) <= Math.floor(Date.now() / 1000)) return null;
    if (requiredRole && payload.role !== requiredRole) return null;
    return payload;
  } catch (error) {
    return null;
  }
}

function signValue(value) {
  const secret = getSetting('TOKEN_SECRET', true);
  return base64WebSafe(Utilities.computeHmacSha256Signature(String(value), secret, Utilities.Charset.UTF_8));
}

function hashPassword(password, salt) {
  const pepper = getSetting('TOKEN_SECRET', true);
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, salt + ':' + password + ':' + pepper, Utilities.Charset.UTF_8);
  return base64WebSafe(bytes);
}

function base64WebSafe(bytes) {
  return Utilities.base64EncodeWebSafe(bytes).replace(/=+$/g, '');
}

function constantTimeEquals(left, right) {
  const a = String(left || '');
  const b = String(right || '');
  let mismatch = a.length ^ b.length;
  const length = Math.max(a.length, b.length);
  for (let i = 0; i < length; i++) mismatch |= (a.charCodeAt(i % Math.max(1, a.length)) || 0) ^ (b.charCodeAt(i % Math.max(1, b.length)) || 0);
  return mismatch === 0;
}

/* ========================= PROMPT YÊU THÍCH ========================= */

function favoriteUserKey(principal) {
  if (!principal || !principal.sub || !principal.role) return '';
  return cleanText(principal.role, 30) + ':' + cleanText(principal.sub, 160);
}

function getFavoriteRows(sheet, userKey, promptId) {
  if (!sheet || sheet.getLastRow() <= 1 || !userKey) return [];
  const values = sheet.getDataRange().getValues();
  const headers = values[0].map(normalizeHeader);
  const userIndex = headers.indexOf('user_id');
  const promptIndex = headers.indexOf('prompt_id');
  if (userIndex === -1 || promptIndex === -1) return [];
  const wantedPrompt = String(promptId || '');
  const rows = [];
  for (let index = 1; index < values.length; index++) {
    const sameUser = String(values[index][userIndex]) === userKey;
    const samePrompt = !wantedPrompt || String(values[index][promptIndex]) === wantedPrompt;
    if (sameUser && samePrompt) rows.push({ row: index + 1, promptId: String(values[index][promptIndex]) });
  }
  return rows;
}

function getFavoritePromptIds(principal) {
  const userKey = favoriteUserKey(principal);
  if (!userKey) return [];
  const sheet = ensureSheet('PromptFavorites', FAVORITE_HEADERS);
  const unique = {};
  getFavoriteRows(sheet, userKey).forEach(function (entry) { if (entry.promptId) unique[entry.promptId] = true; });
  return Object.keys(unique);
}

function handleToggleFavorite(payload, data) {
  const principal = resolvePrincipal(payload);
  if (!principal) return createResponse({ status: 'error', message: 'Vui lòng đăng nhập để đồng bộ Prompt yêu thích.' });
  enforceRateLimit(payload.clientId, 'favorite', 120);
  const promptId = cleanText(data.promptId, 80);
  if (!promptId) return createResponse({ status: 'error', message: 'Thiếu mã Prompt.' });
  const promptSheet = ensureSheet('Prompts', PROMPT_HEADERS);
  if (!findRowById(promptSheet, promptId)) return createResponse({ status: 'error', message: 'Prompt không còn tồn tại.' });
  const shouldFavorite = data.favorite === true || String(data.favorite).toLowerCase() === 'true' || Number(data.favorite) === 1;
  const userKey = favoriteUserKey(principal);
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const sheet = ensureSheet('PromptFavorites', FAVORITE_HEADERS);
    const existing = getFavoriteRows(sheet, userKey, promptId);
    if (shouldFavorite && !existing.length) {
      appendRecord(sheet, { user_id: userKey, prompt_id: promptId, created_at: new Date().toISOString() });
    }
    if (!shouldFavorite && existing.length) {
      existing.sort(function (a, b) { return b.row - a.row; }).forEach(function (entry) { sheet.deleteRow(entry.row); });
    }
    return createResponse({
      status: 'success',
      favorite: shouldFavorite,
      favorites: getFavoritePromptIds(principal)
    });
  } finally {
    lock.releaseLock();
  }
}

function handleSyncFavorites(payload, data) {
  const principal = resolvePrincipal(payload);
  if (!principal) return createResponse({ status: 'error', message: 'Vui lòng đăng nhập để đồng bộ Prompt yêu thích.' });
  enforceRateLimit(payload.clientId, 'favorite-sync', 30);
  const requested = Array.isArray(data.promptIds) ? data.promptIds.slice(0, 300) : [];
  const requestedSet = {};
  requested.forEach(function (id) {
    const promptId = cleanText(id, 80);
    if (promptId) requestedSet[promptId] = true;
  });
  const validSet = {};
  getSheetObjects('Prompts').forEach(function (item) {
    const id = String(readInsensitive(item, 'id') || '');
    if (id && requestedSet[id]) validSet[id] = true;
  });
  const userKey = favoriteUserKey(principal);
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const sheet = ensureSheet('PromptFavorites', FAVORITE_HEADERS);
    const existingSet = {};
    getFavoriteRows(sheet, userKey).forEach(function (entry) { existingSet[entry.promptId] = true; });
    Object.keys(validSet).forEach(function (promptId) {
      if (!existingSet[promptId]) {
        appendRecord(sheet, { user_id: userKey, prompt_id: promptId, created_at: new Date().toISOString() });
      }
    });
    return createResponse({ status: 'success', favorites: getFavoritePromptIds(principal) });
  } finally {
    lock.releaseLock();
  }
}

function deleteFavoritesForPrompt(promptId) {
  const sheet = ensureSheet('PromptFavorites', FAVORITE_HEADERS);
  if (sheet.getLastRow() <= 1) return;
  const values = sheet.getDataRange().getValues();
  const headers = values[0].map(normalizeHeader);
  const promptIndex = headers.indexOf('prompt_id');
  if (promptIndex === -1) return;
  const rows = [];
  for (let index = 1; index < values.length; index++) {
    if (String(values[index][promptIndex]) === String(promptId)) rows.push(index + 1);
  }
  rows.sort(function (a, b) { return b - a; }).forEach(function (row) { sheet.deleteRow(row); });
}

/* ========================= GEMINI ========================= */

function handleAgeReading(data, clientId) {
  enforceRateLimit(clientId, 'age-reading', 30);
  const facts = normalizeAgeReadingFacts(data || {});
  const calculation = ageReadingCalculation(facts);
  const cache = CacheService.getScriptCache();
  const digest = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    JSON.stringify(facts),
    Utilities.Charset.UTF_8
  );
  const cacheKey = 'age-reading-v10:' + Utilities.base64EncodeWebSafe(digest).replace(/=+$/g, '').slice(0, 42);
  try {
    const cached = cache.get(cacheKey);
    if (cached) return createResponse({ status: 'success', analysisVersion: AGE_ANALYSIS_VERSION, analysis: JSON.parse(cached), calculation: calculation, cached: true });
  } catch (_) {}

  const promptText = `Bạn là người biên tập nội dung lịch Can Chi bằng tiếng Việt rõ ràng, sâu sắc, khách quan và thận trọng.

DỮ KIỆN ĐÃ ĐƯỢC HỆ THỐNG E-GV TÍNH SẴN:
${JSON.stringify(facts, null, 2)}

YÊU CẦU BẮT BUỘC:
1. Trích xuất và sử dụng tuyệt đối các dữ kiện E-GV đã cung cấp. Không tự tính lại, không thay đổi điểm tổng, điểm ngày, điểm tháng, điểm năm, tên Can Chi, nạp âm hoặc tên quan hệ.
2. Điểm tổng và ba điểm thành phần là kết quả có thẩm quyền của E-GV. Phải diễn giải để nội dung nhất quán với đúng mức đánh giá đã cho, không được tự nâng hoặc hạ mức độ.
3. Phân tích đủ ba tầng theo đúng trọng số: ngày là ảnh hưởng chính 80%, tháng là bối cảnh 15%, năm là ảnh hưởng nền 5%. Không được chỉ nói về ngày rồi bỏ qua tháng hoặc năm.
4. Phân tích độc lập ba yếu tố Ngũ hành, Thiên can và Địa chi. Trong mỗi yếu tố, phải nhắc đủ quan hệ của tuổi với ngày, tháng và năm bằng đúng tên trong dữ kiện.
5. Với Ngũ hành, nêu tên hành của tuổi cùng hành của ngày, tháng và năm. Chỉ nêu cơ chế như Hỏa khắc Kim hoặc Thủy sinh Mộc khi cơ chế đó được suy ra trực tiếp từ chính các hành và quan hệ đã có; tuyệt đối không thêm một quan hệ mới.
6. Với Thiên can và Địa chi, nêu rõ cặp Can hoặc Chi đang được so sánh cùng tên quan hệ E-GV đã tính. Không tự suy diễn Tam hợp, Tứ hành xung, quý nhân, cát tinh hoặc hung tinh nếu dữ kiện không nêu.
7. Quy ước diễn giải: Sinh xuất và Khắc xuất cho thấy bản thân có thể phải bỏ thêm công sức, dễ mệt hoặc tốn nguồn lực nhưng vẫn có thể đạt kết quả. Đồng chi, Tỷ hòa và Tương hòa là trạng thái bình hòa, không tự coi là tốt hoặc xấu. Tương sinh, Sinh nhập, Tương hợp và Lục hợp là yếu tố hỗ trợ. Tương khắc, Khắc nhập, Tương xung, Tương hại, Tương hình, Tương phá và Tự hình là yếu tố cần lưu ý, nhưng phải dùng ngôn ngữ thận trọng.
8. Phân tích đa chiều. Nếu có điểm bất lợi, hãy nêu yếu tố hỗ trợ hoặc cân bằng thực sự có trong dữ kiện. Nếu nhiều yếu tố cùng thuận hoặc cùng nghịch, giải thích sự cộng hưởng và lý do điểm tổng đạt mức hiện tại.
9. Không dùng từ tuyệt đối như chắc chắn thất bại, tai họa, đại cát hoặc bảo đảm may mắn. Ưu tiên các cụm từ có thể, dễ, nên lưu ý, cần chuẩn bị.
10. Phần gợi ý phải phân biệt công việc thường ngày với việc quan trọng như mua bán, xây sửa hoặc ký kết. Không khẳng định một ngày là an toàn tuyệt đối. Chỉ gợi ý tham khảo ngày khác khi các yếu tố cần lưu ý chiếm ưu thế; không tự bịa ngày, Hành hoặc Chi phù hợp trong tương lai.
11. Khẳng định điểm trên thang 100 là chỉ số tương hợp tham khảo theo quy tắc E-GV, không phải phần trăm may mắn hoặc xác suất kết quả thực tế.
12. Mỗi phần phải trả lời được hai câu hỏi: quan hệ này tác động thực tế như thế nào và người xem nên làm gì để tận dụng hoặc giảm ảnh hưởng. Không được chỉ nhắc lại tên quan hệ rồi kết thúc.
13. Tổng quan phải mở đầu bằng kết luận trực tiếp ngày này thuộc mức nào và công việc thường ngày có thể tiến hành hay không. Phải chỉ ra yếu tố ngày, tháng hoặc năm nào đang kéo điểm lên hoặc xuống.
14. Điểm cần lưu ý phải nêu nguy cơ cụ thể phù hợp với dữ kiện, chẳng hạn hao công, chậm tiến độ, hiểu lầm, bất đồng, thay đổi kế hoạch hoặc phải sửa lại; không gom mọi trường hợp thành câu chung chung.
15. Gợi ý thực hiện phải dùng ba ý rõ trong cùng một đoạn văn: "Có thể làm:", "Cần thận trọng:" và "Nếu vẫn tiến hành:". Phải đề cập cụ thể việc thường ngày, ký kết hoặc mua bán và xây sửa khi phù hợp với mức điểm.
16. Không dùng các câu mẫu rỗng nghĩa như "tác động phụ thuộc vào tính chất công việc", "cần đọc các yếu tố cùng nhau" hoặc "kết hợp với điều kiện thực tế" nếu không nói tiếp một hành động cụ thể.

QUY TẮC ĐẦU RA JSON:
1. Chỉ trả về duy nhất một đối tượng JSON hợp lệ, không bọc trong Markdown và không có văn bản nào ngoài JSON.
2. Không dùng danh sách hoặc gạch đầu dòng trong giá trị. Không để trường nào rỗng, không dùng dấu gạch ngang hoặc câu quá ngắn để thay cho nội dung.
3. Mỗi trường phải là một đoạn văn hoàn chỉnh, rõ ý và không lặp nguyên văn trường khác.
4. Chỉ dùng đúng bảy trường sau:
{"overview":"3 đến 4 câu kết luận trực tiếp, giải thích mức điểm và việc thường ngày có thể tiến hành hay không, tối đa 1200 ký tự","nguHanh":"3 đến 5 câu nêu đủ quan hệ Ngũ hành ngày, tháng, năm cùng tác động thực tế và cách ứng xử, tối đa 1100 ký tự","thienCan":"3 đến 5 câu nêu đủ quan hệ Thiên can ngày, tháng, năm cùng ảnh hưởng đến chủ động, phối hợp hoặc hao công, tối đa 1100 ký tự","diaChi":"3 đến 5 câu nêu đủ quan hệ Địa chi ngày, tháng, năm cùng nguy cơ hoặc điểm hỗ trợ cụ thể; phải viết trọn ý đến hết quan hệ của năm, tối đa 1100 ký tự","context":"2 đến 4 câu chỉ rõ phần nào kéo điểm lên hoặc xuống theo trọng số ngày 80%, tháng 15% và năm 5%, tối đa 900 ký tự","caution":"2 đến 4 câu nêu các ảnh hưởng có thể gặp và phần cần kiểm tra trước khi quyết định, tối đa 800 ký tự","recommendation":"Một đoạn có đủ ba cụm Có thể làm, Cần thận trọng và Nếu vẫn tiến hành, đưa lời khuyên cụ thể cho việc thường ngày, ký kết hoặc mua bán và xây sửa, tối đa 800 ký tự"}`;

  const analysis = callGeminiAgeReading(promptText, facts);
  try { cache.put(cacheKey, JSON.stringify(analysis), 21600); } catch (_) {}
  return createResponse({ status: 'success', analysisVersion: AGE_ANALYSIS_VERSION, analysis: analysis, calculation: calculation, cached: false });
}

function ageReadingCalculation(facts) {
  return {
    version: AGE_SCORE_MODEL_VERSION,
    score: Number(facts && facts.diemTuongHop || 0),
    level: String(facts && facts.mucDanhGia || 'Cân bằng'),
    periods: {
      day: Number(facts && facts.ngay && facts.ngay.diem || 0),
      month: Number(facts && facts.thang && facts.thang.diem || 0),
      year: Number(facts && facts.nam && facts.nam.diem || 0)
    }
  };
}

function normalizeAgeReadingFacts(data) {
  const relationNames = [
    'Tỷ hòa', 'Tương hòa', 'Tương hợp', 'Tương sinh', 'Sinh nhập', 'Sinh xuất',
    'Tương khắc', 'Khắc nhập', 'Khắc xuất', 'Đồng chi', 'Tự hình', 'Lục hợp',
    'Tương xung', 'Tương hại', 'Tương hình', 'Tương phá'
  ];
  const relationScores = {
    'Tỷ hòa': 68, 'Tương hòa': 68, 'Tương hợp': 88, 'Tương sinh': 78,
    'Sinh nhập': 78, 'Sinh xuất': 52, 'Tương khắc': 32, 'Khắc nhập': 32,
    'Khắc xuất': 52, 'Đồng chi': 60, 'Tự hình': 42, 'Lục hợp': 88,
    'Tương xung': 32, 'Tương hại': 38, 'Tương hình': 42, 'Tương phá': 42
  };
  const elements = ['Kim', 'Mộc', 'Thủy', 'Hỏa', 'Thổ'];

  function integerInRange(value, minimum, maximum, label) {
    const number = Number(value);
    if (!isFinite(number) || Math.floor(number) !== number || number < minimum || number > maximum) {
      throw new Error(label + ' không hợp lệ.');
    }
    return number;
  }

  function allowedText(value, allowed, label) {
    const text = cleanText(value, 40);
    if (allowed.indexOf(text) === -1) throw new Error(label + ' không hợp lệ.');
    return text;
  }

  function relation(input, label) {
    const name = allowedText(input && input.label, relationNames, label);
    return { ten: name, diem: relationScores[name] };
  }

  function period(input, label, weights) {
    const value = input || {};
    const relations = value.relations || {};
    const name = cleanText(value.name, 40);
    const napAm = cleanText(value.napAm, 60);
    if (!name || !napAm) throw new Error('Thiếu Can Chi hoặc nạp âm của ' + label.toLowerCase() + '.');
    const elementRelation = relation(relations.element, 'Quan hệ ngũ hành ' + label.toLowerCase());
    const stemRelation = relation(relations.stem, 'Quan hệ Thiên can ' + label.toLowerCase());
    const branchRelation = relation(relations.branch, 'Quan hệ Địa chi ' + label.toLowerCase());
    const contribution = elementRelation.diem * weights.element
      + stemRelation.diem * weights.stem
      + branchRelation.diem * weights.branch;
    return {
      canChi: name,
      napAm: napAm,
      nguHanh: allowedText(value.element, elements, 'Ngũ hành ' + label.toLowerCase()),
      diem: Math.round(contribution / weights.total),
      quanHe: {
        nguHanh: elementRelation,
        thienCan: stemRelation,
        diaChi: branchRelation
      },
      contribution: contribution
    };
  }

  const birthYear = integerInRange(data.birthYear, 1900, new Date().getFullYear(), 'Năm sinh');
  const solarDate = cleanText(data.solarDate, 10);
  const lunarDate = cleanText(data.lunarDate, 20);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(solarDate) || !/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(lunarDate)) {
    throw new Error('Ngày được chọn không hợp lệ.');
  }
  const age = data.age || {};
  const ageName = cleanText(age.name, 40);
  const ageNapAm = cleanText(age.napAm, 60);
  if (!ageName || !ageNapAm) throw new Error('Thiếu thông tin tuổi.');

  const day = period(data.day, 'Ngày', { element: 0.32, stem: 0.192, branch: 0.288, total: 0.80 });
  const month = period(data.month, 'Tháng', { element: 0.05, stem: 0.035, branch: 0.065, total: 0.15 });
  const year = period(data.year, 'Năm', { element: 0.0175, stem: 0.0125, branch: 0.02, total: 0.05 });
  const totalScore = Math.round((day.diem * 80 + month.diem * 15 + year.diem * 5) / 100);
  delete day.contribution;
  delete month.contribution;
  delete year.contribution;
  return {
    phienBanTinhDiem: AGE_SCORE_MODEL_VERSION,
    tuoi: {
      namSinh: birthYear,
      canChi: ageName,
      napAm: ageNapAm,
      nguHanh: allowedText(age.element, elements, 'Ngũ hành tuổi')
    },
    ngayDuong: solarDate,
    ngayAm: lunarDate,
    diemTuongHop: totalScore,
    mucDanhGia: ageReadingLevel(totalScore),
    ngay: day,
    thang: month,
    nam: year,
    sao: cleanText(data.lunarMansion, 30),
    truc: cleanText(data.dayOfficer, 30),
    ghiChu: 'Điểm trên thang 100 là chỉ số tương hợp theo bộ quy tắc E-GV, lấy 50 làm mốc cân bằng; không phải phần trăm may mắn hoặc xác suất khoa học.'
  };
}

function ageReadingLevel(score) {
  if (score < 40) return 'Nên thận trọng';
  if (score < 50) return 'Cần cân nhắc';
  if (score < 65) return 'Cân bằng';
  if (score < 78) return 'Khá thuận';
  if (score < 90) return 'Thuận';
  return 'Rất thuận';
}

function fallbackAgeAnalysis(facts) {
  const score = Number(facts && facts.diemTuongHop || 0);
  const level = String(facts && facts.mucDanhGia || 'Cân bằng');
  const ageName = String(facts && facts.tuoi && facts.tuoi.canChi || 'tuổi đã chọn');
  const dayName = String(facts && facts.ngay && facts.ngay.canChi || 'ngày đang xem');
  const monthName = String(facts && facts.thang && facts.thang.canChi || 'tháng đang xem');
  const yearName = String(facts && facts.nam && facts.nam.canChi || 'năm đang xem');
  const periods = [
    { label: 'Ngày', weight: 80, value: facts && facts.ngay || {} },
    { label: 'Tháng', weight: 15, value: facts && facts.thang || {} },
    { label: 'Năm', weight: 5, value: facts && facts.nam || {} }
  ];
  const cautious = [];

  function canChiPart(canChi, index, fallback) {
    const parts = String(canChi || '').trim().split(/\s+/);
    return parts[index] || fallback;
  }

  function relationName(period, factor) {
    return String(period && period.quanHe && period.quanHe[factor] && period.quanHe[factor].ten || 'chưa xác định');
  }

  function factorSummary(factor, kind) {
    const ageCanChi = facts && facts.tuoi && facts.tuoi.canChi || '';
    return periods.map(function (period) {
      const periodCanChi = period.value.canChi || '';
      if (factor === 'nguHanh') {
        return period.label + ' ' + periodCanChi + ' thuộc hành ' + String(period.value.nguHanh || 'chưa xác định')
          + ', quan hệ với hành ' + String(facts && facts.tuoi && facts.tuoi.nguHanh || 'chưa xác định')
          + ' của tuổi là ' + relationName(period.value, factor) + '.';
      }
      const index = factor === 'thienCan' ? 0 : 1;
      return kind + ' ' + canChiPart(ageCanChi, index, 'chưa xác định') + ' của tuổi gặp '
        + kind.toLowerCase() + ' ' + canChiPart(periodCanChi, index, 'chưa xác định') + ' của ' + period.label.toLowerCase()
        + ', quan hệ ' + relationName(period.value, factor) + '.';
    }).join(' ');
  }

  periods.forEach(function (period) {
    const relations = period.value.quanHe || {};
    ['nguHanh', 'thienCan', 'diaChi'].forEach(function (key) {
      const relation = relations[key] || {};
      const labels = { nguHanh: 'Ngũ hành', thienCan: 'Thiên can', diaChi: 'Địa chi' };
      const item = labels[key] + ' của ' + period.label.toLowerCase() + ' có quan hệ ' + String(relation.ten || 'chưa xác định');
      if (Number(relation.diem || 0) <= 52) cautious.push(item);
    });
  });

  const context = periods.map(function (period) {
    return period.label + ' ' + String(period.value.canChi || 'đang xem') + ' đạt ' + Number(period.value.diem || 0)
      + '/100 và giữ trọng số ' + period.weight + '%.';
  }).join(' ');
  const caution = cautious.length
    ? 'Các điểm cần lưu ý gồm ' + cautious.slice(0, 6).join('; ') + '. Sinh xuất hoặc Khắc xuất chủ yếu cho thấy có thể phải bỏ thêm công sức, còn các quan hệ xung khắc cần được xem như lời nhắc chuẩn bị kỹ chứ không phải dự báo thất bại.'
    : 'Không có điểm xung khắc nổi bật trong dữ kiện. Dù vậy vẫn nên kiểm tra thông tin và tránh xem kết quả tham khảo là bảo đảm chắc chắn.';

  let recommendation = 'Có thể làm: công việc thường ngày và những việc đã có kế hoạch rõ. Cần thận trọng: kiểm tra giấy tờ, chi phí và người phối hợp trước khi ký kết, mua bán hoặc xây sửa. Nếu vẫn tiến hành: chia công việc thành từng bước và giữ phương án dự phòng.';
  if (score >= 78) {
    recommendation = 'Có thể làm: ưu tiên công việc quan trọng khi hồ sơ và nguồn lực đã sẵn sàng. Cần thận trọng: vẫn kiểm tra điều khoản, chi phí, tiến độ và trách nhiệm các bên. Nếu vẫn tiến hành khi còn điểm chưa thuận: chốt rõ từng bước và người chịu trách nhiệm.';
  } else if (score < 40) {
    recommendation = 'Có thể làm: việc thường ngày, hoàn thiện việc cũ và chuẩn bị hồ sơ. Cần thận trọng: nên cân nhắc dời đặt cọc, ký hợp đồng lớn hoặc khởi công nếu thời gian cho phép. Nếu vẫn tiến hành: xác nhận lại thông tin, chia nhỏ từng bước và chuẩn bị phương án dự phòng.';
  } else if (score < 50) {
    recommendation = 'Có thể làm: công việc thường ngày và việc đã chuẩn bị chắc chắn. Cần thận trọng: chưa nên chốt vội ký kết, mua bán, đặt cọc hoặc xây sửa; hãy rà soát giấy tờ, chi phí và thời hạn. Nếu vẫn tiến hành: làm từng bước, xác nhận lại với các bên và giữ phương án dự phòng.';
  }
  return {
    overview: 'Tuổi ' + ageName + ' có điểm tương hợp ' + score + '/100, thuộc mức ' + level + ' khi xét ngày ' + dayName + ', tháng ' + monthName + ' và năm ' + yearName + '. Mốc 50 được xem là cân bằng. Đây là chỉ số tham khảo theo năm sinh, không phải phần trăm may mắn hoặc dự báo chắc chắn.',
    nguHanh: 'Tuổi ' + ageName + ' thuộc hành ' + String(facts && facts.tuoi && facts.tuoi.nguHanh || 'chưa xác định') + '. ' + factorSummary('nguHanh', 'Ngũ hành') + ' Các quan hệ này cần được đọc cùng nhau, không dùng một quan hệ riêng lẻ để kết luận toàn bộ ngày.',
    thienCan: factorSummary('thienCan', 'Can') + ' Sinh xuất hoặc Khắc xuất cho thấy có thể tốn thêm công sức; quan hệ hỗ trợ hoặc bình hòa chỉ tạo điều kiện thuận hơn chứ không bảo đảm kết quả.',
    diaChi: factorSummary('diaChi', 'Chi') + ' Phần này chỉ sử dụng đúng tên quan hệ E-GV đã tính và không tự suy thêm Tam hợp, Tứ hành xung hoặc quý nhân.',
    context: context + ' Tổng điểm ' + score + '/100 được tổng hợp theo trọng số ngày 80%, tháng 15% và năm 5%, nên điểm ngày quyết định phần lớn kết quả khi so sánh từng ngày nhưng vẫn có điều chỉnh theo bối cảnh tháng và năm.',
    caution: caution,
    recommendation: recommendation
  };
}

function extractLooseGeminiField(source, names) {
  const text = String(source || '');
  for (let nameIndex = 0; nameIndex < names.length; nameIndex++) {
    const safeName = String(names[nameIndex]).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = new RegExp('["\\\']?' + safeName + '["\\\']?\\s*:\\s*["\\\']', 'i').exec(text);
    if (!match) continue;
    const quote = match[0].slice(-1);
    let value = '';
    let escaped = false;
    for (let index = match.index + match[0].length; index < text.length; index++) {
      const character = text[index];
      if (escaped) {
        value += character === 'n' ? '\n' : character;
        escaped = false;
      } else if (character === '\\') {
        escaped = true;
      } else if (character === quote) {
        break;
      } else {
        value += character;
      }
    }
    if (value.trim()) return value.trim();
  }
  return '';
}

function cleanAgeAnalysisText(value, maxLength) {
  const text = cleanText(value, 10000);
  const limit = Number(maxLength || 1400);
  if (text.length <= limit) return text;

  const clipped = text.slice(0, limit + 1);
  const sentenceEnds = [clipped.lastIndexOf('. '), clipped.lastIndexOf('! '), clipped.lastIndexOf('? ')];
  const sentenceEnd = Math.max.apply(null, sentenceEnds);
  if (sentenceEnd >= Math.floor(limit * 0.6)) return clipped.slice(0, sentenceEnd + 1).trim();

  const wordEnd = clipped.lastIndexOf(' ');
  const safeEnd = wordEnd > 0 ? wordEnd : limit;
  return clipped.slice(0, safeEnd).replace(/[,:;\s]+$/g, '').trim() + '.';
}

function parseGeminiAgeResponse(text, facts) {
  const fallback = fallbackAgeAnalysis(facts);
  const cleaned = String(text || '')
    .replace(/^\uFEFF/, '')
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  let parsed = null;
  const attempts = [cleaned];
  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) attempts.push(cleaned.slice(firstBrace, lastBrace + 1));
  for (let index = 0; index < attempts.length && !parsed; index++) {
    try {
      parsed = JSON.parse(attempts[index]);
      if (typeof parsed === 'string') parsed = JSON.parse(parsed);
      if (Array.isArray(parsed)) parsed = parsed[0] || null;
    } catch (_) {}
  }

  if (parsed && typeof parsed === 'object' && parsed.analysis && typeof parsed.analysis === 'object') parsed = parsed.analysis;
  const usableText = function (value, minimumLength) {
    const candidate = typeof value === 'string' ? value.trim() : '';
    if (!candidate || /^(?:[-–—]+|n\/?a|không có|chưa có)$/i.test(candidate)) return '';
    return candidate.length >= minimumLength ? candidate : '';
  };
  const firstText = function (object, names, minimumLength) {
    for (let index = 0; index < names.length; index++) {
      const value = object && object[names[index]];
      const candidate = usableText(value, minimumLength);
      if (candidate) return candidate;
    }
    return '';
  };
  const fields = {
    overview: { minimum: 80, names: ['overview', 'summary', 'tongQuan', 'tổngQuan', 'tong_quan', 'nhanXet', 'nhậnXét'] },
    nguHanh: { minimum: 70, names: ['nguHanh', 'nguhanh', 'ngu_hanh', 'element'] },
    thienCan: { minimum: 70, names: ['thienCan', 'thiencan', 'thien_can', 'stem'] },
    diaChi: { minimum: 70, names: ['diaChi', 'diachi', 'dia_chi', 'branch'] },
    context: { minimum: 70, names: ['context', 'influence', 'impact', 'boiCanh', 'bốiCảnh', 'boi_canh', 'anhHuong', 'ảnhHưởng', 'anh_huong'] },
    caution: { minimum: 50, names: ['caution', 'note', 'luuY', 'lưuÝ', 'luu_y'] },
    recommendation: { minimum: 50, names: ['recommendation', 'advice', 'goiY', 'gợiÝ', 'goi_y'] }
  };
  const normalized = {};
  const fallbackFields = [];
  Object.keys(fields).forEach(function (key) {
    const field = fields[key];
    const generated = firstText(parsed, field.names, field.minimum)
      || usableText(extractLooseGeminiField(cleaned, field.names), field.minimum);
    if (!generated) fallbackFields.push(key);
    normalized[key] = generated || fallback[key];
  });

  return {
    overview: cleanAgeAnalysisText(normalized.overview, 1500),
    nguHanh: cleanAgeAnalysisText(normalized.nguHanh, 1400),
    thienCan: cleanAgeAnalysisText(normalized.thienCan, 1400),
    diaChi: cleanAgeAnalysisText(normalized.diaChi, 1400),
    context: cleanAgeAnalysisText(normalized.context, 1200),
    caution: cleanAgeAnalysisText(normalized.caution, 1000),
    recommendation: cleanAgeAnalysisText(normalized.recommendation, 1000),
    _meta: {
      source: fallbackFields.length ? 'hybrid' : 'gemini',
      fallbackFields: fallbackFields
    }
  };
}

function callGeminiAgeReading(promptText, facts) {
  const apiKeys = getGeminiApiKeys();
  const defaultModel = getSetting('GEMINI_MODEL', false, 'gemini-3.6-flash');
  const model = getSetting('GEMINI_AGE_MODEL', false, defaultModel);
  const requestBody = {
    contents: [{ parts: [{ text: promptText }] }],
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: 4500,
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'OBJECT',
        properties: {
          overview: { type: 'STRING' },
          nguHanh: { type: 'STRING' },
          thienCan: { type: 'STRING' },
          diaChi: { type: 'STRING' },
          context: { type: 'STRING' },
          caution: { type: 'STRING' },
          recommendation: { type: 'STRING' }
        },
        required: ['overview', 'nguHanh', 'thienCan', 'diaChi', 'context', 'caution', 'recommendation']
      }
    }
  };
  let lastMessage = 'Gemini không trả về nội dung.';

  for (let keyIndex = 0; keyIndex < apiKeys.length; keyIndex++) {
    const url = 'https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(model) + ':generateContent?key=' + encodeURIComponent(apiKeys[keyIndex]);
    let response;
    try {
      response = UrlFetchApp.fetch(url, {
        method: 'post',
        contentType: 'application/json',
        payload: JSON.stringify(requestBody),
        muteHttpExceptions: true
      });
    } catch (fetchError) {
      lastMessage = safeError(fetchError);
      if (keyIndex < apiKeys.length - 1) {
        Utilities.sleep(400 * (keyIndex + 1));
        continue;
      }
      break;
    }

    const responseCode = response.getResponseCode();
    let result = {};
    try {
      result = JSON.parse(response.getContentText() || '{}');
    } catch (_) {
      lastMessage = 'Phản hồi Gemini không đúng định dạng.';
      if (keyIndex < apiKeys.length - 1) continue;
      break;
    }

    if (responseCode >= 200 && responseCode < 300 && result.candidates && result.candidates.length) {
      const text = ((result.candidates[0].content && result.candidates[0].content.parts) || [])
        .map(function (part) { return part.text || ''; }).join('\n').trim();
      return parseGeminiAgeResponse(text, facts);
    }

    lastMessage = result.error && result.error.message ? String(result.error.message) : 'Gemini không trả về nội dung.';
    const canTryNext = keyIndex < apiKeys.length - 1 && shouldTryNextGeminiKey(responseCode, result, lastMessage);
    if (!canTryNext) break;
    Utilities.sleep(responseCode === 429 ? 1000 : 400 * (keyIndex + 1));
  }
  throw new Error('Gemini hiện chưa sẵn sàng. ' + lastMessage);
}

function enforceLessonPlanTiming(text, periods, durationText) {
  const lines = String(text || '').replace(/\r\n?/g, '\n').split('\n').filter(function (line) {
    const plain = String(line || '').replace(/\*\*/g, '').trim();
    return !/^Số\s+tiết\s*:/i.test(plain) && !/^Thời\s+lượng\s*:/i.test(plain);
  });
  const periodLine = '**Số tiết:** ' + periods;
  const durationLine = '**Thời lượng:** ' + durationText;

  let insertAt = lines.findIndex(function (line) {
    return /^\s*(?:\*\*)?Tên\s+bài(?:\*\*)?\s*:/i.test(String(line || ''));
  });
  if (insertAt < 0) {
    insertAt = lines.findIndex(function (line) { return /KẾ\s+HOẠCH\s+BÀI\s+DẠY/i.test(String(line || '')); });
  }
  insertAt = insertAt < 0 ? 0 : insertAt + 1;
  lines.splice(insertAt, 0, periodLine, durationLine);
  return lines.join('\n').trim();
}

function handleLessonPlan(data) {
  const apiKeys = getGeminiApiKeys();
  const model = getSetting('GEMINI_MODEL', false, 'gemini-3.6-flash');
  const subject = cleanText(data.subject || '', 120);
  const grade = cleanText(data.grade || '', 30);
  const lesson = cleanText(data.lesson || '', 220);
  const periods = Math.min(12, Math.max(1, Math.round(Number(data.periods) || 1)));
  const minutesPerPeriod = Math.min(120, Math.max(20, Math.round(Number(data.minutesPerPeriod) || 35)));
  const totalMinutes = periods * minutesPerPeriod;
  const durationText = periods === 1
    ? '1 tiết (' + minutesPerPeriod + ' phút)'
    : periods + ' tiết (mỗi tiết ' + minutesPerPeriod + ' phút, tổng ' + totalMinutes + ' phút)';
  const integrated = cleanText(data.integrated || 'Không', 1200);
  const images = Array.isArray(data.images) ? data.images.slice(0, 12) : [];

  const promptText = `Bạn là một giáo viên Tiểu học có nhiều năm kinh nghiệm.
Hãy đọc kỹ các hình ảnh SGK tôi cung cấp và xây dựng một KẾ HOẠCH BÀI DẠY hoàn chỉnh, bám sát Chương trình GDPT 2018 và chuẩn mẫu cấu trúc của phân môn Tiếng Việt (Đọc).

THÔNG TIN GỢI Ý (Nếu có):
- Môn: ${subject || 'Tự động trích xuất từ ảnh'}
- Lớp: ${grade || 'Tự động trích xuất từ ảnh'}
- Tên bài: ${lesson || 'Tự động trích xuất từ ảnh'}
- Số tiết: ${periods}
- Thời lượng mỗi tiết: ${minutesPerPeriod} phút
- Tổng thời lượng: ${totalMinutes} phút
- Nội dung tích hợp: ${integrated || 'Không'}

YÊU CẦU PHÂN TÍCH VÀ SOẠN BÀI CHUYÊN SÂU:
1. Bám sát nội dung ảnh SGK. Tổng hợp dữ liệu từ tất cả các trang ảnh. KHÔNG sử dụng icon trang trí. Không xuất mã HTML hoặc thẻ <br>.
2. CHI TIẾT ĐÁP ÁN: Mọi câu hỏi đưa ra BẮT BUỘC phải kèm theo ĐÁP ÁN chi tiết hoặc hướng dẫn trả lời cụ thể ở cột "HOẠT ĐỘNG CỦA HS".
3. CÁCH XƯNG HÔ VÀ LỜI THOẠI:
   - Trong phần mô tả hành động, VẪN GIỮ NGUYÊN viết tắt là "GV" (Ví dụ: - GV tổ chức..., - GV cho HS quan sát...).
   - Tại các bước nhận xét, tổng kết, kết luận, HÃY VIẾT SẴN CÂU NÓI TRỰC TIẾP. Trong lời thoại trực tiếp, BẮT BUỘC xưng hô là "thầy" và gọi "các em" (Ví dụ: - GV nhận xét: "Hôm nay các em đã làm việc rất tốt. Thầy khen ngợi tinh thần học tập tích cực của cả lớp."). Tuyệt đối KHÔNG dùng "Thầy/Cô" hay "cô".
4. Tuân thủ ĐÚNG cấu trúc chia nhỏ a) Mục tiêu và b) Cách tổ chức dạy học ở MỖI HOẠT ĐỘNG.
5. QUY TẮC BẢNG BẮT BUỘC:
   - Toàn bộ nội dung bắt đầu bằng GV hoặc HS phải nằm trong bảng hai cột "HOẠT ĐỘNG CỦA GV" và "HOẠT ĐỘNG CỦA HS". KHÔNG viết bất kỳ dòng GV/HS nào bên ngoài bảng.
   - Mỗi hàng Markdown phải nằm trọn trên một dòng, bắt đầu bằng dấu |, có đúng hai ô ngăn cách bằng dấu | và kết thúc bằng dấu |.
   - Mỗi cặp hoạt động GV và HS tương ứng trình bày trên cùng một hàng. Nếu một bên chưa có nội dung thì để ô đó trống nhưng vẫn giữ đủ dấu |.
   - Chỉ dùng dấu gạch đầu dòng (-), không dùng dấu chấm tròn (•).
6. QUY TẮC TÍCH HỢP:
   - Chỉ sử dụng những nội dung tích hợp người dùng đã chọn; không tự thêm chủ đề khác.
   - Mỗi nội dung phải phù hợp tự nhiên với kiến thức và hoạt động của bài, không lồng ghép hình thức hoặc gượng ép.
   - Phải thể hiện bằng yêu cầu cần đạt, câu hỏi, tình huống hoặc việc làm cụ thể của HS trong hoạt động phù hợp; không chỉ liệt kê lại tên nội dung.
   - Nếu có nhiều lựa chọn, ưu tiên 1–2 nội dung liên quan trực tiếp nhất để bài học không bị quá tải.
7. QUY TẮC THỜI LƯỢNG:
   - Giữ chính xác ${periods} tiết, mỗi tiết ${minutesPerPeriod} phút; không tự thay đổi số tiết hoặc thời lượng.
   - Phân bổ các hoạt động hợp lý trong tổng ${totalMinutes} phút và ghi số phút dự kiến ngay sau tên từng hoạt động.
   - Nếu bài có từ 2 tiết trở lên, ghi rõ **TIẾT 1**, **TIẾT 2**... và phân chia nội dung tương ứng; không dồn toàn bộ hoạt động vào một tiết.

CẤU TRÚC KẾ HOẠCH BÀI DẠY BẮT BUỘC (Trình bày y hệt như sau):

**KẾ HOẠCH BÀI DẠY**
**Môn:** [Tìm trong hình điền vào]
**Lớp:** [Tìm trong hình điền vào]
**Tên bài:** [Tìm trong hình điền vào]
**Số tiết:** ${periods}
**Thời lượng:** ${durationText}

I. YÊU CẦU CẦN ĐẠT
1. Năng lực chung.
- ...
2. Năng lực đặc thù.
- ...
3. Phẩm chất.
- ...

II. ĐỒ DÙNG DẠY HỌC
- GV: ...
- HS: ...

III. CÁC HOẠT ĐỘNG DẠY HỌC CHỦ YẾU

1. Hoạt động mở đầu:
a) Mục tiêu: ...
b) Cách tổ chức dạy học:
| HOẠT ĐỘNG CỦA GV | HOẠT ĐỘNG CỦA HS |
| --- | --- |
| - ... | - ... |

2. Hình thành kiến thức:
a) Mục tiêu: ...
b) Cách tổ chức dạy học:
(Ghi chú: Nếu là bài Tập đọc hãy chia thành HĐ1: Luyện đọc, HĐ2: Tìm hiểu bài. Các môn khác chia hoạt động tương ứng)
| HOẠT ĐỘNG CỦA GV | HOẠT ĐỘNG CỦA HS |
| --- | --- |
| - ... | - ... |

3. Luyện tập, thực hành:
a) Mục tiêu: ...
b) Cách tổ chức dạy học:
| HOẠT ĐỘNG CỦA GV | HOẠT ĐỘNG CỦA HS |
| --- | --- |
| - ... | - ... |

4. Vận dụng:
a) Mục tiêu: ...
b) Cách tổ chức dạy học:
| HOẠT ĐỘNG CỦA GV | HOẠT ĐỘNG CỦA HS |
| --- | --- |
| - ... | - ... |

IV. ĐIỀU CHỈNH SAU BÀI DẠY (nếu có):
(Để khoảng trống 2 dòng)`;

  const parts = [{ text: promptText }];
  images.forEach(function (image) {
    if (!image || !image.base64 || !String(image.mimeType || '').match(/^image\//i)) return;
    parts.push({ inlineData: { mimeType: String(image.mimeType), data: String(image.base64) } });
  });

  const requestBody = {
    contents: [{ parts: parts }],
    generationConfig: { temperature: 0.25, maxOutputTokens: 32768 }
  };
  let lastMessage = 'Gemini không trả về nội dung.';
  for (let keyIndex = 0; keyIndex < apiKeys.length; keyIndex++) {
    const url = 'https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(model) + ':generateContent?key=' + encodeURIComponent(apiKeys[keyIndex]);
    let response;
    try {
      response = UrlFetchApp.fetch(url, {
        method: 'post', contentType: 'application/json', payload: JSON.stringify(requestBody), muteHttpExceptions: true
      });
    } catch (fetchError) {
      lastMessage = safeError(fetchError);
      console.warn('Gemini key #' + (keyIndex + 1) + ' gặp lỗi kết nối: ' + lastMessage);
      if (keyIndex < apiKeys.length - 1) {
        Utilities.sleep(500 * (keyIndex + 1));
        continue;
      }
      break;
    }

    const responseCode = response.getResponseCode();
    let result = {};
    try {
      result = JSON.parse(response.getContentText() || '{}');
    } catch (parseError) {
      lastMessage = 'Phản hồi Gemini không đúng định dạng.';
      console.warn('Gemini key #' + (keyIndex + 1) + ' trả về dữ liệu không hợp lệ.');
      if (keyIndex < apiKeys.length - 1) continue;
      break;
    }

    if (responseCode >= 200 && responseCode < 300 && result.candidates && result.candidates.length) {
      const text = ((result.candidates[0].content && result.candidates[0].content.parts) || []).map(function (part) { return part.text || ''; }).join('\n').trim();
      if (text) return createResponse({ status: 'success', result: enforceLessonPlanTiming(text, periods, durationText) });
      lastMessage = 'Gemini trả về nội dung rỗng.';
      break;
    }

    lastMessage = result.error && result.error.message ? String(result.error.message) : 'Gemini không trả về nội dung.';
    console.warn('Gemini key #' + (keyIndex + 1) + ' lỗi ' + responseCode + ': ' + lastMessage);
    const canTryNext = keyIndex < apiKeys.length - 1 && shouldTryNextGeminiKey(responseCode, result, lastMessage);
    if (!canTryNext) break;
    Utilities.sleep(responseCode === 429 ? 1200 : 500 * (keyIndex + 1));
  }
  return createResponse({ status: 'error', message: 'Các máy chủ Gemini hiện chưa sẵn sàng. Chi tiết: ' + lastMessage });
}

/* ========================= DRIVE CÔNG KHAI ========================= */

function handlePublicUpload(data, clientId) {
  enforceRateLimit(clientId, 'upload', 30);
  const mimeType = normalizeMime(data.mimeType);
  const fileName = sanitizeFileName(data.fileName);
  const base64 = String(data.base64 || '');
  const estimatedBytes = Math.floor(base64.length * 0.75);
  validateUpload(mimeType, estimatedBytes);
  const folder = DriveApp.getFolderById(getSetting('FOLDER_ID', true));
  const blob = Utilities.newBlob(Utilities.base64Decode(base64), mimeType, fileName);
  const file = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return createResponse({ status: 'success', fileUrl: file.getUrl(), fileId: file.getId() });
}

function handleResumableUrl(data, clientId) {
  enforceRateLimit(clientId, 'resumable', 30);
  const origin = String(data.origin || APP_ORIGIN);
  if (origin !== APP_ORIGIN) return createResponse({ status: 'error', message: 'Tên miền tải tệp không hợp lệ.' });
  const mimeType = normalizeMime(data.mimeType);
  const fileName = sanitizeFileName(data.fileName);
  const fileSize = Number(data.fileSize || 0);
  validateUpload(mimeType, fileSize);

  const headers = {
    Authorization: 'Bearer ' + ScriptApp.getOAuthToken(),
    'Content-Type': 'application/json; charset=UTF-8',
    Origin: APP_ORIGIN,
    'X-Upload-Content-Type': mimeType,
    'X-Upload-Content-Length': String(fileSize)
  };
  const response = UrlFetchApp.fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable', {
    method: 'post', headers: headers,
    payload: JSON.stringify({ name: fileName, parents: [getSetting('FOLDER_ID', true)] }),
    muteHttpExceptions: true
  });
  const code = response.getResponseCode();
  const responseHeaders = response.getAllHeaders();
  const location = responseHeaders.Location || responseHeaders.location || '';
  if ((code === 200 || code === 201) && location) return createResponse({ status: 'success', resumableUrl: location });
  return createResponse({ status: 'error', message: 'Không tạo được phiên tải tệp: ' + response.getContentText() });
}

function handleSetPermission(data, clientId) {
  enforceRateLimit(clientId, 'permission', 60);
  const fileId = String(data.fileId || '');
  if (!fileId) return createResponse({ status: 'error', message: 'Thiếu mã tệp.' });
  const file = DriveApp.getFileById(fileId);
  if (!fileBelongsToFolder(file, getSetting('FOLDER_ID', true))) return createResponse({ status: 'error', message: 'Tệp không thuộc thư mục được phép.' });
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return createResponse({ status: 'success', fileUrl: file.getUrl() });
}

function validateUpload(mimeType, fileSize) {
  const maxMb = Number(getSetting('MAX_UPLOAD_MB', false, '100')) || 100;
  if (!fileSize || fileSize < 0 || fileSize > maxMb * 1024 * 1024) throw new Error('Dung lượng tệp vượt quá giới hạn ' + maxMb + ' MB.');
  const allowed = /^(image\/|audio\/|video\/|text\/plain$|application\/(pdf|zip|x-zip-compressed|msword|vnd\.ms-|vnd\.openxmlformats-officedocument|octet-stream))/i;
  if (!allowed.test(mimeType)) throw new Error('Loại tệp này không được phép tải lên.');
}

function fileBelongsToFolder(file, folderId) {
  const parents = file.getParents();
  while (parents.hasNext()) if (parents.next().getId() === folderId) return true;
  return false;
}

function enforceRateLimit(clientId, action, limit) {
  const id = String(clientId || '');
  if (id.length < 12 || id.length > 150) throw new Error('Thiếu mã phiên tải hợp lệ. Hãy tải lại trang.');
  const keyBytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, action + ':' + id, Utilities.Charset.UTF_8);
  const key = 'rate:' + action + ':' + Utilities.base64EncodeWebSafe(keyBytes).slice(0, 28);
  const cache = CacheService.getScriptCache();
  const count = Number(cache.get(key) || 0);
  if (count >= limit) throw new Error('Đã vượt giới hạn thao tác. Vui lòng thử lại sau.');
  cache.put(key, String(count + 1), 3600);
}

/* ========================= CRUD SHEETS ========================= */

function handleCreate(sheetType, data) {
  const repairs = sheetType === 'repairs';
  const sheet = ensureSheet(repairs ? 'Repairs' : 'Prompts', repairs ? REPAIR_HEADERS : PROMPT_HEADERS);
  const record = repairs ? {
    id: 'REP-' + Date.now(), date: data.date, task: data.task, location: data.location,
    cost: data.cost, warranty: data.warranty, status: data.status, vendor: data.vendor,
    reporter: data.reporter, asset_id: data.asset_id, image_url: data.image_url, note: data.note
  } : {
    id: 'PR-' + Date.now(), title: data.title, category: data.category, content: data.content,
    platform: data.platform, access: normalizePromptAccess(data.access), created_at: new Date().toISOString()
  };
  appendRecord(sheet, record);
  return createResponse({ status: 'success', message: 'Đã tạo dữ liệu.' });
}

function handleUpdate(sheetType, data) {
  const repairs = sheetType === 'repairs';
  const sheet = ensureSheet(repairs ? 'Repairs' : 'Prompts', repairs ? REPAIR_HEADERS : PROMPT_HEADERS);
  const found = findRowById(sheet, data.id);
  if (!found) return createResponse({ status: 'error', message: 'Không tìm thấy ID.' });
  const record = repairs ? {
    date: data.date, task: data.task, location: data.location, cost: data.cost,
    warranty: data.warranty, status: data.status, vendor: data.vendor, reporter: data.reporter,
    asset_id: data.asset_id, image_url: data.image_url, note: data.note
  } : {
    title: data.title, category: data.category, content: data.content,
    platform: data.platform, access: normalizePromptAccess(data.access)
  };
  updateRecordAtRow(sheet, found.row, record);
  return createResponse({ status: 'success', message: 'Cập nhật thành công.' });
}

function handleDelete(sheetType, data) {
  const repairs = sheetType === 'repairs';
  const sheet = ensureSheet(repairs ? 'Repairs' : 'Prompts', repairs ? REPAIR_HEADERS : PROMPT_HEADERS);
  const found = findRowById(sheet, data.id);
  if (!found) return createResponse({ status: 'error', message: 'Không tìm thấy ID.' });
  sheet.deleteRow(found.row);
  if (!repairs) deleteFavoritesForPrompt(data.id);
  return createResponse({ status: 'success', message: 'Đã xóa dữ liệu.' });
}

function ensureSheet(name, requiredHeaders) {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = spreadsheet.getSheetByName(name);
  if (!sheet) sheet = spreadsheet.insertSheet(name);
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(requiredHeaders);
    sheet.setFrozenRows(1);
    return sheet;
  }
  const lastColumn = Math.max(1, sheet.getLastColumn());
  const headers = sheet.getRange(1, 1, 1, lastColumn).getValues()[0].map(String);
  const normalized = headers.map(normalizeHeader);
  const missing = requiredHeaders.filter(function (header) { return normalized.indexOf(normalizeHeader(header)) === -1; });
  if (missing.length) sheet.getRange(1, headers.length + 1, 1, missing.length).setValues([missing]);
  sheet.setFrozenRows(1);
  return sheet;
}

function getSheetObjects(name) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
  if (!sheet || sheet.getLastRow() <= 1) return [];
  const values = sheet.getDataRange().getValues();
  const headers = values[0].map(function (header) { return String(header).trim(); });
  return values.slice(1).filter(function (row) {
    return row.some(function (value) { return value !== '' && value !== null; });
  }).map(function (row) {
    const item = {};
    headers.forEach(function (header, index) { if (header) item[header] = row[index]; });
    return item;
  });
}

function appendRecord(sheet, record) {
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(String);
  const normalizedRecord = {};
  Object.keys(record).forEach(function (key) { normalizedRecord[normalizeHeader(key)] = record[key]; });
  sheet.appendRow(headers.map(function (header) {
    const key = normalizeHeader(header);
    return normalizedRecord[key] !== undefined ? normalizedRecord[key] : '';
  }));
}

function updateRecordAtRow(sheet, row, record) {
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(String);
  const values = sheet.getRange(row, 1, 1, headers.length).getValues()[0];
  const normalizedRecord = {};
  Object.keys(record).forEach(function (key) { normalizedRecord[normalizeHeader(key)] = record[key]; });
  headers.forEach(function (header, index) {
    const key = normalizeHeader(header);
    if (normalizedRecord[key] !== undefined) values[index] = normalizedRecord[key];
  });
  sheet.getRange(row, 1, 1, headers.length).setValues([values]);
}

function findRowById(sheet, id) {
  if (!id || sheet.getLastRow() <= 1) return null;
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(normalizeHeader);
  const idIndex = Math.max(0, headers.indexOf('id'));
  const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();
  for (let index = 0; index < rows.length; index++) {
    if (String(rows[index][idIndex]) === String(id)) return { row: index + 2, values: rows[index] };
  }
  return null;
}

function findUserByEmail(email) {
  const sheet = ensureSheet('Users', USER_HEADERS);
  if (sheet.getLastRow() <= 1) return null;
  const values = sheet.getDataRange().getValues();
  const headers = values[0].map(function (header) { return String(header).trim(); });
  const emailIndex = headers.map(normalizeHeader).indexOf('email');
  for (let index = 1; index < values.length; index++) {
    if (normalizeEmail(values[index][emailIndex]) === email) {
      const data = {};
      headers.forEach(function (header, column) { data[header] = values[index][column]; });
      return { sheet: sheet, row: index + 1, data: data };
    }
  }
  return null;
}

/* ========================= TIỆN ÍCH ========================= */

function readInsensitive(object, key) {
  if (!object) return '';
  const wanted = normalizeHeader(key);
  const found = Object.keys(object).find(function (name) { return normalizeHeader(name) === wanted; });
  return found ? object[found] : '';
}

function setInsensitive(object, key, value) {
  const wanted = normalizeHeader(key);
  const found = Object.keys(object).find(function (name) { return normalizeHeader(name) === wanted; });
  object[found || key] = value;
}

function isVipPrompt(item) {
  const value = String(readInsensitive(item, 'access') || 'normal').toLowerCase();
  return value === 'vip' || value === 'premium' || value === '1' || value === 'true';
}

function normalizePromptAccess(value) {
  return String(value || '').toLowerCase() === 'vip' ? 'vip' : 'normal';
}

function normalizeHeader(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function cleanText(value, maxLength) {
  return String(value || '').replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, maxLength || 500);
}

function sanitizeFileName(value) {
  const name = String(value || 'tep-tai-len').replace(/[\\/:*?"<>|\u0000-\u001F]/g, '_').replace(/\.{2,}/g, '.').trim().slice(0, 180);
  if (!name) throw new Error('Tên tệp không hợp lệ.');
  return name;
}

function normalizeMime(value) {
  return String(value || 'application/octet-stream').split(';')[0].trim().toLowerCase();
}

function safeError(error) {
  const message = error && error.message ? error.message : String(error || 'Lỗi không xác định.');
  return message.replace(/(?:AQ\.|AIza)[A-Za-z0-9_-]+/g, '[API_KEY]').slice(0, 800);
}

function createResponse(object) {
  return ContentService.createTextOutput(JSON.stringify(object)).setMimeType(ContentService.MimeType.JSON);
}
