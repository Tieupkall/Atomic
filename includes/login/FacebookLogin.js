const axios = require('axios');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const querystring = require('querystring');
const speakeasy = require('speakeasy');
const fs = require('fs');
const path = require('path');
const logger = require('../../utils/log.js');

/**
 * FacebookLogin
 * - Sửa các lỗi có thể khiến OTP 2FA bị báo sai
 * - Làm chặt chẽ xử lý lỗi và dữ liệu
 * - Không còn trùng meta_inf_fbmeta
 */
module.exports = class FacebookLogin {
  static async getCredentialsFromAcc() {
    try {
      const accData = require('./acc.json');
      return {
        email: accData.EMAIL,
        password: accData.PASSWORD,
        twoFA: accData['2FA']
      };
    } catch (error) {
      logger('Không thể đọc file acc.json', '[ ERROR ]');
      return null;
    }
  }

  /**
   * Đăng nhập và đổi token/cookie.
   * @param {string} username 
   * @param {string} password 
   * @param {string} twofactor Base32 secret (từ app xác thực) – có thể '0'
   * @param {string} _2fa Mã OTP cụ thể – nếu != '0' sẽ được dùng thay vì tạo bằng secret
   * @returns {Promise<{status:boolean, message:string, data?:any}>}
   */
  static async getTokenFromCredentials(username, password, twofactor = '0', _2fa = '0') {
    try {
      const form = {
        adid: uuidv4(),
        email: username,
        password: password,
        format: 'json',
        device_id: uuidv4(),
        cpl: 'true',
        family_device_id: uuidv4(),
        locale: 'en_US',
        client_country_code: 'US',
        credentials_type: 'device_based_login_password',
        generate_session_cookies: '1',
        generate_analytics_claim: '1',
        generate_machine_id: '1',
        currently_logged_in_userid: '0',
        irisSeqID: 1,
        try_num: '1',
        enroll_misauth: 'false',
        meta_inf_fbmeta: 'NO_FILE',
        source: 'login',
        machine_id: this._randomString(24),
        fb_api_req_friendly_name: 'authenticate',
        fb_api_caller_class: 'com.facebook.account.login.protocol.Fb4aAuthHandler',
        api_key: '882a8490361da98702bf97a021ddc14d',
        access_token: '350685531728|62f8ce9f74b12f84c123cc23437a4a32'
      };

      form.sig = this._encodeSig(this._sort(form));

      const options = {
        url: 'https://b-graph.facebook.com/auth/login',
        method: 'post',
        data: form,
        transformRequest: [(data) => querystring.stringify(data)],
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
          'x-fb-friendly-name': form.fb_api_req_friendly_name,
          'x-fb-http-engine': 'Liger',
          'user-agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/109.0.0.0 Safari/537.36'
        },
        validateStatus: (s) => s >= 200 && s < 500
      };

      // Lần 1: Đăng nhập bằng password
      let response;
      try {
        response = await axios.request(options);
      } catch (networkErr) {
        return {
          status: false,
          message: `Lỗi mạng khi gọi auth/login: ${networkErr.message}`
        };
      }

      if (response.status >= 400) {
        // Nếu server trả lỗi, xử lý tiếp bên dưới
      }

      // Nếu đăng nhập thành công ngay (không cần 2FA)
      if (response?.data?.access_token && response?.data?.session_cookies) {
        const data = await this._postProcessLoginSuccess(response.data);
        return { status: true, message: 'Lấy thông tin thành công!', data };
      }

      // Nếu cần 2FA hoặc có lỗi yêu cầu 2FA
      const errorObj = response?.data?.error || {};
      const errorData = errorObj?.error_data || {};
      const need2FA =
        errorObj?.code === 401 ||
        typeof errorData?.uid !== 'undefined' ||
        errorObj?.message?.toLowerCase()?.includes('two-factor') ||
        errorObj?.message?.toLowerCase()?.includes('2fa');

      if (!need2FA) {
        // Không rơi vào nhánh 2FA nhưng vẫn không có access_token => báo lỗi chung
        const msg = errorObj?.message || 'Đăng nhập thất bại (không rõ nguyên nhân).';
        return { status: false, message: msg };
      }

      // Nếu secret/mã 2FA không có
      if (twofactor === '0' && (!_2fa || _2fa === '0')) {
        return { status: false, message: 'Vui lòng nhập mã xác thực 2 lớp!' };
      }

      // Chuẩn hóa secret
      const normalizedSecret =
        twofactor && twofactor !== '0'
          ? String(twofactor).replace(/\s+/g, '').toUpperCase()
          : null;

      // Nếu người dùng truyền mã 2FA cụ thể (_2fa) thì dùng luôn, ngược lại tự tạo từ secret
      const twoFactorCode =
        _2fa && _2fa !== '0'
          ? String(_2fa).trim()
          : speakeasy.totp({
              secret: normalizedSecret,
              encoding: 'base32'
            });

      // Thực hiện bước 2FA
      const form2FA = {
        ...form,
        twofactor_code: twoFactorCode,
        encrypted_msisdn: '',
        userid: errorData.uid,
        machine_id: errorData.machine_id,
        first_factor: errorData.login_first_factor,
        credentials_type: 'two_factor'
      };
      form2FA.sig = this._encodeSig(this._sort(form2FA));

      const options2FA = { ...options, data: form2FA };

      let resp2FA;
      try {
        resp2FA = await axios.request(options2FA);
      } catch (networkErr2) {
        return {
          status: false,
          message: `Lỗi mạng khi gửi mã 2FA: ${networkErr2.message}`
        };
      }

      if (resp2FA?.data?.access_token && resp2FA?.data?.session_cookies) {
        const data = await this._postProcessLoginSuccess(resp2FA.data);
        return { status: true, message: 'Lấy thông tin thành công!', data };
      }

      // Nếu tới đây mà vẫn chưa có token => coi như mã 2FA sai/hết hạn
      return { status: false, message: 'Mã xác thực 2 lớp không hợp lệ hoặc đã hết hạn!' };
    } catch (e) {
      return {
        status: false,
        message: 'Vui lòng kiểm tra lại tài khoản, mật khẩu!'
      };
    }
  }

  static async _postProcessLoginSuccess(data) {
    try {
      data.access_token_eaad6v7 = await this._convertToken(data.access_token);
    } catch (_) {}

    try {
      data.cookies = await this._convertCookie(data.session_cookies);
    } catch (_) {
      data.cookies = undefined;
    }

    try {
      data.session_cookies = data.session_cookies.map((e) => ({
        key: e.name,
        value: e.value,
        domain: 'facebook.com',
        path: e.path,
        hostOnly: false
      }));
    } catch (_) {}

    return data;
  }

  static async _convertCookie(session) {
    return session.map((e) => `${e.name}=${e.value}`).join('; ');
  }

  static async _convertToken(token) {
    try {
      const response = await axios.get(
        `https://api.facebook.com/method/auth.getSessionforApp?format=json&access_token=${token}&new_app_id=275254692598279`
      );
      return response.data.error ? undefined : response.data.access_token;
    } catch {
      return undefined;
    }
  }

  static _randomString(length) {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let result = chars.charAt(Math.floor(Math.random() * 26));
    for (let i = 1; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  static _encodeSig(obj) {
    const str = Object.entries(obj)
      .map(([key, value]) => `${key}=${value}`)
      .join('');
    return crypto.createHash('md5').update(str + '62f8ce9f74b12f84c123cc23437a4a32').digest('hex');
  }

  static _sort(obj) {
    return Object.keys(obj)
      .sort()
      .reduce((acc, key) => {
        acc[key] = obj[key];
        return acc;
      }, {});
  }
};
