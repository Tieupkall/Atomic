const axios = require('axios');
const qs = require('querystring');
const path = require('path');
const fs = require('fs-extra');
const logger = require(process.cwd() + '/utils/log.js');
const FacebookLogin = require('./FacebookLogin.js');
const speakeasy = require('speakeasy');

function waitForSafeTotpWindow(stepSec = 30, safeHeadroomSec = 4) {
  const now = Math.floor(Date.now() / 1000);
  const secToNext = stepSec - (now % stepSec);
  const waitMs = (secToNext < safeHeadroomSec ? (secToNext + stepSec) : 0) * 1000;
  return new Promise(resolve => setTimeout(resolve, waitMs));
}

function getCurrentAccount() {
  try {
    const accPath = path.join(__dirname, 'acc.json');
    if (!fs.existsSync(accPath)) return null;
    const accData = JSON.parse(fs.readFileSync(accPath, 'utf8'));
    return accData.current_account || 'account1';
  } catch (error) {
    logger(`Lỗi khi đọc current account: ${error.message}`, '[ ERROR ]');
    return 'account1';
  }
}

function getAccountInfo(accountName = null) {
  try {
    const accPath = path.join(__dirname, 'acc.json');
    if (!fs.existsSync(accPath)) return null;
    const accData = JSON.parse(fs.readFileSync(accPath, 'utf8'));
    if (!accountName) accountName = accData.current_account || 'account1';
    return accData.accounts && accData.accounts[accountName] ? accData.accounts[accountName] : null;
  } catch (error) {
    logger(`Lỗi khi đọc thông tin tài khoản ${accountName}: ${error.message}`, '[ ERROR ]');
    return null;
  }
}

function updateAccountInfo(accountName, data) {
  try {
    const accPath = path.join(__dirname, 'acc.json');
    let accData = {};
    if (fs.existsSync(accPath)) accData = JSON.parse(fs.readFileSync(accPath, 'utf8'));
    if (!accData.accounts) accData.accounts = {};
    if (!accData.accounts[accountName]) accData.accounts[accountName] = {};
    Object.assign(accData.accounts[accountName], data);
    fs.writeFileSync(accPath, JSON.stringify(accData, null, 2));
    return true;
  } catch (error) {
    logger(`Lỗi khi cập nhật tài khoản ${accountName}: ${error.message}`, '[ ERROR ]');
    return false;
  }
}

function setCurrentAccount(accountName) {
  try {
    const accPath = path.join(__dirname, 'acc.json');
    let accData = {};
    if (fs.existsSync(accPath)) accData = JSON.parse(fs.readFileSync(accPath, 'utf8'));
    accData.current_account = accountName;
    fs.writeFileSync(accPath, JSON.stringify(accData, null, 2));
    return true;
  } catch (error) {
    logger(`Lỗi khi đặt current account: ${error.message}`, '[ ERROR ]');
    return false;
  }
}

function getCUserFromCookie(cookieStr) {
  const m = /(?:^|;\s*)c_user=(\d+)/.exec(cookieStr || '');
  return m ? m[1] : null;
}

function addOrReplaceIUser(cookieStr, iUserId) {
  if (!cookieStr || !iUserId) return cookieStr;
  const parts = cookieStr.split(';').map(s => s.trim()).filter(Boolean).filter(kv => !/^i_user=/i.test(kv));
  parts.push(`i_user=${iUserId}`);
  return parts.join('; ');
}

function isTrueFlag(v) {
  if (v === true) return true;
  if (typeof v === 'string') {
    const s = v.trim().toLowerCase();
    return s === 'true' || s === '1' || s === 'yes';
  }
  return false;
}

async function fetchSubProfileIdsMsite(cookie) {
  try {
    const url = 'https://m.facebook.com/switchprofile/multiple_profiles/';
    const res = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 Mobile Safari/537.36',
        'Cookie': cookie,
        'Accept-Language': 'vi,en-US;q=0.9'
      },
      maxRedirects: 0,
      validateStatus: s => s >= 200 && s < 400,
      timeout: 15000
    });
    const html = String(res.data || '');
    const ids = new Set();
    const rx = /profile_id=(\d+)/g;
    let m;
    while ((m = rx.exec(html)) !== null) ids.add(m[1]);
    return Array.from(ids);
  } catch (e) {
    logger(`Không thể dò profile phụ qua msite: ${e.message}`, '[ WARNING ]');
    return [];
  }
}

async function resolveIUserId(accountInfo) {
  try {
    if (!isTrueFlag(accountInfo?.i_user)) return null;
    if (accountInfo?.i_user_id) return String(accountInfo.i_user_id).trim();
    const cUser = getCUserFromCookie(accountInfo?.COOKIE || '');
    const list = await fetchSubProfileIdsMsite(accountInfo?.COOKIE || '');
    const pick = list.find(id => id && id !== cUser);
    return pick || null;
  } catch {
    return null;
  }
}

function upsertCookie(cookiesArr, entry) {
  if (!Array.isArray(cookiesArr) || !entry || !entry.key) return;
  const idx = cookiesArr.findIndex(c => String(c.key).toLowerCase() === String(entry.key).toLowerCase());
  if (idx >= 0) cookiesArr[idx] = { ...cookiesArr[idx], ...entry };
  else cookiesArr.push(entry);
}

async function bypassCheckpoint(accountName = null) {
  try {
    if (!accountName) accountName = getCurrentAccount();
    const accountInfo = getAccountInfo(accountName);
    if (!accountInfo || !accountInfo.COOKIE) {
      logger(`Không có cookie cho tài khoản ${accountName}`, '[ ERROR ]');
      return false;
    }
    const userId = getCUserFromCookie(accountInfo.COOKIE);
    if (!userId) {
      logger('Không tìm thấy user ID trong cookie', '[ ERROR ]');
      return false;
    }
    logger(`Đang vượt checkpoint cho tài khoản ${accountName}...`, '[ BYPASS ]');
    let retryCount = 0;
    const maxRetries = 5;
    const waitForFbDtsg = async () => {
      while (!global.fb_dtsg && retryCount < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, 2000));
        retryCount++;
      }
      return global.fb_dtsg;
    };
    const fb_dtsg = await waitForFbDtsg();
    if (!fb_dtsg) {
      logger('Không thể lấy fb_dtsg token', '[ ERROR ]');
      return false;
    }
    const formData = {
      av: userId,
      __user: userId,
      __a: '1',
      __req: 'a',
      __hs: '20061.HYP:comet_pkg.2.1..2.1',
      dpr: '1',
      __ccg: 'EXCELLENT',
      __rev: '1018618676',
      __s: '8mi3v2:j83osx:54zn30',
      __hsi: '7444677681348919953',
      __dyn: '7xeUmwlEnwn8K2Wmh0no6u5U4e0yoW3q32360CEbo19oe8hw2nVE4W099w8G1Dz81s8hwnU2lwv89k2C1Fwc60D8vwRwlE-U2zxe2GewbS361qw8Xwn82Lw5XwSyES1Mw9m0Lo6-1Fw4mwr86C0No7S3m1TwLwHwea',
      __csr: 'hv4AltzuumXh9GxqiqUmKFosBEyhbzEPCBm2m1lxu2y6UmGfwiUeo0y60QEow8m0Oo4y0Po1CE3UwdO0uafw06wxw1em00w68',
      __comet_req: '15',
      fb_dtsg: global.fb_dtsg,
      jazoest: '25337',
      lsd: 'RZRQBZoJoKVYZsOHQnjJHA',
      __spin_r: '1018618676',
      __spin_b: 'trunk',
      __spin_t: Math.floor(Date.now() / 1000),
      fb_api_caller_class: 'RelayModern',
      fb_api_req_friendly_name: 'FBScrapingWarningMutation',
      variables: `{"input":{"client_mutation_id":"1","actor_id":"${userId}","is_comet":true}}`,
      server_timestamps: 'true',
      doc_id: '6339492849481770'
    };
    const headers = {
      accept: '*/*',
      'accept-encoding': 'gzip, deflate, br, zstd',
      'accept-language': 'vi-VN,vi;q=0.9,fr-FR;q=0.8,fr;q=0.7,en-US;q=0.6,en;q=0.5',
      'content-type': 'application/x-www-form-urlencoded',
      cookie: accountInfo.COOKIE,
      origin: 'https://www.facebook.com',
      priority: 'u=1, i',
      referer: 'https://www.facebook.com/checkpoint/601051028565049/?next=https%3A%2F%2Fwww.facebook.com%2F',
      'sec-ch-prefers-color-scheme': 'light',
      'sec-ch-ua': '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
      'sec-ch-ua-full-version-list': '"Google Chrome";v="131.0.6778.87", "Chromium";v="131.0.6778.87", "Not_A Brand";v="24.0.0.0"',
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-model': '""',
      'sec-ch-ua-platform': '"Windows"',
      'sec-ch-ua-platform-version': '"15.0.0"',
      'sec-fetch-dest': 'empty',
      'sec-fetch-mode': 'cors',
      'sec-fetch-site': 'same-origin',
      'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      'x-asbd-id': '129477',
      'x-fb-friendly-name': 'FBScrapingWarningMutation',
      'x-fb-lsd': formData.lsd
    };
    try {
      const response = await axios({
        url: 'https://www.facebook.com/api/graphql/',
        method: 'POST',
        headers,
        data: qs.stringify(formData),
        maxRedirects: 0,
        validateStatus: s => s >= 200 && s < 303
      });
      if (response.status === 200 || response.status === 302) {
        if (response.data && response.data.errors) return false;
        logger(`Vượt checkpoint cho tài khoản ${accountName} thành công!`, '[ SUCCESS ]');
        return true;
      }
      return false;
    } catch (bypassError) {
      logger(`Lỗi khi vượt checkpoint cho ${accountName}: ${bypassError.message}`, '[ ERROR ]');
      return false;
    }
  } catch (error) {
    logger(`Lỗi trong quá trình vượt checkpoint: ${error.message}`, '[ ERROR ]');
    return false;
  }
}

async function logoutCurrentAccount() {
  try {
    const currentAccountName = getCurrentAccount();
    const accountInfo = getAccountInfo(currentAccountName);
    if (!accountInfo) {
      logger('Không tìm thấy thông tin tài khoản hiện tại', '[ WARNING ]');
      return true;
    }
    if (accountInfo.COOKIE) {
      try {
        await axios.post('https://www.facebook.com/logout.php', {}, {
          headers: { Cookie: accountInfo.COOKIE, 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
          timeout: 10000
        });
        logger(`Đã logout tài khoản ${currentAccountName} trên Facebook`, '[ LOGOUT ]');
      } catch {
        logger('Không thể logout trên Facebook, tiếp tục xóa dữ liệu local', '[ WARNING ]');
      }
    }
    updateAccountInfo(currentAccountName, { COOKIE: '', EAAD6V7: '', EAAAAU: '' });
    const appstatePath = path.join(__dirname, 'bkup.json');
    if (fs.existsSync(appstatePath)) {
      fs.unlinkSync(appstatePath);
      logger('Đã xóa appstate cũ', '[ LOGOUT ]');
    }
    logger(`Đã logout tài khoản ${currentAccountName}`, '[ LOGOUT ]');
    return true;
  } catch (error) {
    logger(`Lỗi khi logout: ${error.message}`, '[ ERROR ]');
    return false;
  }
}

async function loginAccount(accountName) {
  try {
    const accountInfo = getAccountInfo(accountName);
    if (!accountInfo) {
      logger(`Không tìm thấy thông tin tài khoản ${accountName}`, '[ ERROR ]');
      return false;
    }
    const { EMAIL: email, PASSWORD: password, '2FA': twoFASecret } = accountInfo;
    if (!email || !password) {
      logger(`Thiếu thông tin đăng nhập cho tài khoản ${accountName}`, '[ ERROR ]');
      return false;
    }
    logger(`Đăng nhập tài khoản ${accountName}: ${email}`, '[ LOGIN ]');
    const config = require('../../config.json');
    let loginResult;
    let attempts = 0;
    const maxAttempts = Math.max(1, config.autoLogin?.retryAttempts || 3);
    const baseDelay = Math.max(35000, config.autoLogin?.retryDelay || 35000);
    const has2FA = twoFASecret && twoFASecret !== '0' && twoFASecret.trim() !== '';
    const normalizedSecret = has2FA ? String(twoFASecret).replace(/\s+/g, '').toUpperCase() : null;

    while (attempts < maxAttempts) {
      attempts++;
      if (has2FA) {
        await waitForSafeTotpWindow(30, 4);
        const twoFactorCode = speakeasy.totp({ secret: normalizedSecret, encoding: 'base32' });
        logger(`Cần xác thực 2FA cho ${accountName}, vui lòng chờ...`, '[ 2FA ]');
        loginResult = await FacebookLogin.getTokenFromCredentials(email, password, normalizedSecret, twoFactorCode);
      } else {
        logger(`Đăng nhập ${accountName} không cần 2FA`, '[ LOGIN ]');
        loginResult = await FacebookLogin.getTokenFromCredentials(email, password, '0', '0');
      }

      if (loginResult?.status) break;

      const msg = (loginResult?.message || '').toString();
      if (loginResult?.code === 'ABUSIVE' || /abusive|disallowed|temporarily blocked|rate limit|limit/i.test(msg)) {
        logger(`Facebook từ chối tài khoản ${accountName} vì nghi ngờ lạm dụng: ${msg}`, '[ ERROR ]');
        return false;
      }
      if (attempts < maxAttempts) {
        const expo = baseDelay * Math.pow(1.6, attempts - 1);
        const jitter = Math.floor(Math.random() * 4000);
        const waitMs = Math.max(35000, Math.min(90000, expo + jitter));
        await new Promise(r => setTimeout(r, waitMs));
      }
    }

    if (!loginResult || !loginResult.status) {
      logger(`Đăng nhập tài khoản ${accountName} thất bại sau ${attempts} lần thử`, '[ ERROR ]');
      return false;
    }

    const baseCookie = loginResult.data.session_cookies
      .filter(c => ['c_user', 'xs', 'fr', 'datr'].includes(c.key))
      .map(c => `${c.key}=${c.value}`)
      .join('; ');

    let finalCookie = baseCookie;
    let iUserId = null;

    if (isTrueFlag(accountInfo?.i_user)) {
      if (accountInfo?.i_user_id) {
        iUserId = String(accountInfo.i_user_id).trim();
      } else {
        const probed = await resolveIUserId({ COOKIE: baseCookie, i_user: accountInfo?.i_user });
        if (probed) {
          iUserId = probed;
          updateAccountInfo(accountName, { i_user_id: iUserId });
        }
      }
    }

    if (iUserId) {
      finalCookie = addOrReplaceIUser(baseCookie, iUserId);
      const now = new Date().toISOString();
      upsertCookie(loginResult.data.session_cookies, {
        key: 'i_user',
        value: iUserId,
        domain: 'facebook.com',
        path: '/',
        hostOnly: false,
        creation: now,
        lastAccessed: now
      });
    }

    const appstatePath = path.join(__dirname, 'bkup.json');
    try {
      fs.writeFileSync(appstatePath, JSON.stringify(loginResult.data.session_cookies, null, 2), 'utf8');
    } catch (e) {
      logger(`Không thể ghi bkup.json: ${e.message}`, '[ ERROR ]');
    }

    const updateData = { COOKIE: finalCookie };
    if (loginResult.data.access_token_eaad6v7) updateData.EAAD6V7 = loginResult.data.access_token_eaad6v7;
    if (loginResult.data.access_token) updateData.EAAAAU = loginResult.data.access_token;
    updateAccountInfo(accountName, updateData);
    setCurrentAccount(accountName);

    logger(`Đăng nhập tài khoản ${accountName} thành công`, '[ SUCCESS ]');
    return true;
  } catch (error) {
    logger(`Lỗi khi đăng nhập tài khoản ${accountName}: ${error.message}`, '[ ERROR ]');
    return false;
  }
}

async function switchAccount(targetAccountName) {
  try {
    const config = require('../../config.json');
    if (!config.autoLogin || !config.autoLogin.enabled) {
      logger('Auto login chưa được bật trong config.json', '[ ERROR ]');
      return false;
    }
    const currentAccountName = getCurrentAccount();
    if (!targetAccountName) {
      logger('Chưa chỉ định tài khoản đích', '[ ERROR ]');
      return false;
    }
    if (currentAccountName === targetAccountName) {
      logger(`Đã đang sử dụng tài khoản ${targetAccountName}`, '[ WARNING ]');
      return true;
    }
    logger(`Bắt đầu chuyển từ ${currentAccountName} sang ${targetAccountName}...`, '[ SWITCH ]');
    logger('Đang logout tài khoản hiện tại...', '[ SWITCH ]');
    await logoutCurrentAccount();
    logger(`Đang đăng nhập tài khoản ${targetAccountName}...`, '[ SWITCH ]');
    const loginSuccess = await loginAccount(targetAccountName);
    if (loginSuccess) {
      logger(`Chuyển đổi từ ${currentAccountName} sang ${targetAccountName} thành công`, '[ SUCCESS ]');
      logger('Đang khởi động lại bot...', '[ RESTART ]');
      global.client.commands = new Map();
      global.client.events = new Map();
      setTimeout(() => { process.exit(1); }, 1000);
      return true;
    } else {
      logger(`Chuyển đổi sang tài khoản ${targetAccountName} thất bại`, '[ ERROR ]');
      return false;
    }
  } catch (error) {
    logger(`Lỗi khi chuyển đổi tài khoản: ${error.message}`, '[ ERROR ]');
    return false;
  }
}

async function handleRelogin() {
  try {
    const config = require('../../config.json');
    if (!config.autoLogin || !config.autoLogin.enabled) return false;
    const currentAccountName = getCurrentAccount();
    const accountInfo = getAccountInfo(currentAccountName);
    if (!accountInfo) {
      logger(`Không tìm thấy thông tin tài khoản ${currentAccountName}`, '[ ERROR ]');
      return false;
    }
    const { EMAIL: email, PASSWORD: password, '2FA': twoFASecret } = accountInfo;
    if (!email || !password) {
      logger(`Thiếu thông tin tài khoản ${currentAccountName} trong acc.json`, '[ ERROR ]');
      return false;
    }
    logger(`Bắt đầu đăng nhập lại tài khoản ${currentAccountName}...`, '[ LOGIN ]');
    const loginSuccess = await loginAccount(currentAccountName);
    if (loginSuccess) {
      logger('Đang khởi động lại bot...', '[ RESTART ]');
      global.client.commands = new Map();
      global.client.events = new Map();
      setTimeout(() => { process.exit(1); }, 1000);
      return true;
    }
    return false;
  } catch (error) {
    logger(`Lỗi khi đăng nhập lại: ${error.message}`, '[ ERROR ]');
    return false;
  }
}

async function handleError(error) {
  try {
    const errorStr = JSON.stringify(error);
    if (errorStr.includes('601051028565049') || errorStr.includes('401') || errorStr.includes('341') || errorStr.includes('368') || errorStr.includes('551')) {
      const currentAccountName = getCurrentAccount();
      logger(`Phát hiện checkpoint Facebook cho tài khoản ${currentAccountName}, đang tiến hành vượt...`, '[ WARNING ]');
      const ok = await bypassCheckpoint(currentAccountName);
      if (ok) {
        logger(`Vượt checkpoint cho tài khoản ${currentAccountName} thành công!`, '[ SUCCESS ]');
        return true;
      } else {
        logger(`Vượt checkpoint cho tài khoản ${currentAccountName} thất bại`, '[ ERROR ]');
        return false;
      }
    }
    return false;
  } catch (e) {
    logger(`Lỗi khi xử lý error: ${e.message}`, '[ ERROR ]');
    return false;
  }
}

function getAllAccounts() {
  try {
    const accPath = path.join(__dirname, 'acc.json');
    if (!fs.existsSync(accPath)) return {};
    const accData = JSON.parse(fs.readFileSync(accPath, 'utf8'));
    return accData.accounts || {};
  } catch (error) {
    logger(`Lỗi khi đọc danh sách tài khoản: ${error.message}`, '[ ERROR ]');
    return {};
  }
}

module.exports = {
  waitForSafeTotpWindow,
  getCurrentAccount,
  getAccountInfo,
  updateAccountInfo,
  setCurrentAccount,
  addOrReplaceIUser,
  resolveIUserId,
  bypassCheckpoint,
  handleError,
  logoutCurrentAccount,
  loginAccount,
  switchAccount,
  handleRelogin,
  getAllAccounts
};