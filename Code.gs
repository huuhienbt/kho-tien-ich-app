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

function doGet(e) {
  try {
    const type = String((e && e.parameter && e.parameter.type) || 'prompts').toLowerCase();
    if (type === 'repairs') return createResponse({ status: 'success', data: getSheetObjects('Repairs').reverse() });
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

function doPost(e) {
  try {
    const payload = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    const action = String(payload.action || '').trim();
    const data = payload.data || {};

    if (action === 'verify') return handleAdminLogin(payload.adminPassword, payload.clientId);
    if (action === 'user_register') return handleUserRegister(data, payload.clientId);
    if (action === 'user_login') return handleUserLogin(data, payload.clientId);
    if (action === 'google_login') return handleGoogleLogin(data, payload.clientId);

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

function handleLessonPlan(data) {
  const apiKeys = getGeminiApiKeys();
  const model = getSetting('GEMINI_MODEL', false, 'gemini-3.6-flash');
  const subject = cleanText(data.subject || '', 120);
  const grade = cleanText(data.grade || '', 30);
  const lesson = cleanText(data.lesson || '', 220);
  const integrated = cleanText(data.integrated || 'Không', 500);
  const images = Array.isArray(data.images) ? data.images.slice(0, 12) : [];

  const promptText = `Bạn là một giáo viên Tiểu học có nhiều năm kinh nghiệm.
Hãy đọc kỹ các hình ảnh SGK tôi cung cấp và xây dựng một KẾ HOẠCH BÀI DẠY hoàn chỉnh, bám sát Chương trình GDPT 2018 và chuẩn mẫu cấu trúc của phân môn Tiếng Việt (Đọc).

THÔNG TIN GỢI Ý (Nếu có):
- Môn: ${subject || 'Tự động trích xuất từ ảnh'}
- Lớp: ${grade || 'Tự động trích xuất từ ảnh'}
- Tên bài: ${lesson || 'Tự động trích xuất từ ảnh'}
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

CẤU TRÚC KẾ HOẠCH BÀI DẠY BẮT BUỘC (Trình bày y hệt như sau):

**KẾ HOẠCH BÀI DẠY**
**Môn:** [Tìm trong hình điền vào]
**Lớp:** [Tìm trong hình điền vào]
**Tên bài:** [Tìm trong hình điền vào]
**Thời lượng:** [Tự cân đối thời lượng trong bài, ví dụ: 1 tiết (35 phút)]

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
      if (text) return createResponse({ status: 'success', result: text });
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
