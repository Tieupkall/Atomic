const fs = require('fs');
const path = require('path');

module.exports.config = {
  name: "checkscam",
  version: "1.0.0",
  hasPermssion: 2,
  credits: "Atomic",
  description: "Quản lý danh sách checkscam",
  commandCategory: "Tiện ích",
  usages: "[add/remove] [thông tin]",
  cooldowns: 5,
  dependencies: {}
};

module.exports.run = async function({ api, event, args }) {
  const { threadID, messageID, senderID } = event;
  const scamDataPath = path.join(__dirname, '../../data/scamData.json');

  // Đảm bảo thư mục tồn tại
  const dataDir = path.dirname(scamDataPath);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  // Đọc JSON
  function readScamData() {
    try {
      if (fs.existsSync(scamDataPath)) {
        const data = fs.readFileSync(scamDataPath, 'utf8');
        return JSON.parse(data);
      }
    } catch (error) {
      console.error('Lỗi đọc file scamData.json:', error);
    }
    return { scammers: [] };
  }

  // Ghi JSON với cấu trúc đơn giản
  function writeScamData(data) {
    try {
      // Chuyển đổi dữ liệu thành cấu trúc đơn giản
      const simplifiedData = {
        scammers: data.scammers.map(scammer => {
          const simplified = {};
          
          // Chỉ giữ lại các trường cần thiết
          if (scammer.userId) simplified.userId = scammer.userId;
          if (scammer.link) simplified.link = scammer.link;
          if (scammer.stk) simplified.stk = scammer.stk;
          if (scammer.phone) simplified.phone = scammer.phone;
          if (scammer.username) simplified.username = scammer.username;
          if (scammer.bankName) simplified.bankName = scammer.bankName;
          
          return simplified;
        })
      };
      
      fs.writeFileSync(scamDataPath, JSON.stringify(simplifiedData, null, 2), 'utf8');
      return true;
    } catch (error) {
      console.error('Lỗi ghi file scamData.json:', error);
      return false;
    }
  }

  // Hàm validate số điện thoại Việt Nam
  function isValidVietnamesePhone(phone) {
    const cleanPhone = phone.replace(/[\s-]/g, '');
    const phoneRegex = /^(\+84|84|0)(3[2-9]|5[6|8|9]|7[0|6-9]|8[1-9]|9[0-9])\d{7}$/;
    return phoneRegex.test(cleanPhone);
  }

  // Hàm trích xuất Facebook ID từ link
  function extractFacebookId(url) {
    const normalizedUrl = url.trim().toLowerCase();

    const patterns = [
      /(?:facebook\.com|fb\.com|m\.facebook\.com)\/profile\.php\?id=(\d+)/i,
      /(?:facebook\.com|fb\.com|m\.facebook\.com)\/(\d+)(?:\/|$|\?)/i,
      /facebook\.com\/people\/[^\/]+\/(\d+)/i,
      /(?:facebook\.com|fb\.com)\/(?:pages|pg)\/[^\/]+\/(\d+)/i,
      /[?&]id=(\d+)/i,
    ];

    for (const pattern of patterns) {
      const match = normalizedUrl.match(pattern);
      if (match && match[1] && /^\d+$/.test(match[1])) {
        return {
          id: match[1],
          type: 'id',
          original: match[1],
          method: 'url_parse'
        };
      }
    }

    const usernamePattern = /(?:facebook\.com|fb\.com|m\.facebook\.com)\/([a-zA-Z0-9._-]+)(?:\/|$|\?)/i;
    const usernameMatch = normalizedUrl.match(usernamePattern);
    if (usernameMatch && usernameMatch[1]) {
      const username = usernameMatch[1];
      const excludedPaths = ['profile.php', 'people', 'pages', 'pg', 'groups', 'events', 'marketplace', 'watch', 'gaming', 'share'];
      if (!excludedPaths.includes(username)) {
        return {
          username: username,
          type: 'username',
          original: username,
          method: 'url_parse'
        };
      }
    }

    return null;
  }

  const permission = global.config.ADMINBOT || [];
  if (!permission.includes(senderID) && args[0] === "add") {
    return api.sendMessage("❌ Bạn không có quyền thêm dữ liệu scam!", threadID, messageID);
  }

  const action = args[0]?.toLowerCase();
  if (!action) {
    return api.sendMessage(`📋 Hướng dẫn sử dụng CheckScam:

🔸 ${global.config.PREFIX}checkscam add id <facebook_id>
🔸 ${global.config.PREFIX}checkscam add stk <số_tk> [ngân_hàng]
🔸 ${global.config.PREFIX}checkscam add link <link_fb>
🔸 ${global.config.PREFIX}checkscam add sdt <số_điện_thoại>
🔸 ${global.config.PREFIX}checkscam remove <id>`, threadID, messageID);
  }

  const scamData = readScamData();

  switch (action) {
    case "add": {
      if (args.length < 3) {
        return api.sendMessage("❌ Thiếu thông tin! Dùng cú pháp: add id/stk/link/sdt <giá trị> [mô tả]", threadID, messageID);
      }

      const scamType = args[1].toLowerCase();
      const scamValue = args[2];
      const extraInfo = args.slice(3).join(" ");
      const dateAdded = new Date().toISOString();

      let scammer = {
        id: Date.now().toString(),
        reportedUserId: senderID,
        dateAdded
      };

      switch (scamType) {
        case "id":
          scammer.userId = scamValue;
          scammer.description = extraInfo || "Facebook ID";
          break;

        case "stk":
          scammer.stk = scamValue;
          scammer.bankName = extraInfo || "Không rõ";
          scammer.description = `STK ${scammer.bankName}`;
          break;

        case "link":
          scammer.link = scamValue;
          scammer.description = extraInfo || "Link Facebook";

          try {
            const fbInfo = extractFacebookId(scamValue);
            if (fbInfo) {
              if (fbInfo.type === 'id' && fbInfo.id) {
                scammer.userId = fbInfo.id;
                scammer.description += ` (ID: ${fbInfo.id})`;
              }
              if (fbInfo.username) {
                scammer.username = fbInfo.username;
                scammer.description += ` (Username: ${fbInfo.username})`;
              }
            }
          } catch (error) {
            console.error(`❌ Lỗi khi trích xuất thông tin từ link: ${error.message}`);
          }
          break;

        case "sdt":
          if (!isValidVietnamesePhone(scamValue)) {
            return api.sendMessage("❌ Số điện thoại không hợp lệ! Vui lòng nhập số điện thoại Việt Nam đúng định dạng.", threadID, messageID);
          }
          scammer.phone = scamValue.replace(/[\s-]/g, '');
          scammer.description = extraInfo || "Số điện thoại";
          break;

        default:
          return api.sendMessage("❌ Loại không hợp lệ! Chỉ chấp nhận: id, stk, link, sdt", threadID, messageID);
      }

      // Kiểm tra trùng lặp
      const existing = scamData.scammers.find(s => {
        if (scammer.userId && s.userId && scammer.userId === s.userId) return true;
        if (scammer.phone && s.phone && scammer.phone === s.phone) return true;
        if (scammer.stk && s.stk && scammer.stk === s.stk) return true;
        if (scammer.link && s.link) {
          const normalizeLink = (link) => link.toLowerCase().replace(/[\/\?\&]/g, '');
          if (normalizeLink(scammer.link) === normalizeLink(s.link)) return true;
        }
        if (scammer.username && s.username && 
            scammer.username.toLowerCase() === s.username.toLowerCase()) return true;
        return false;
      });

      if (existing) {
        let existingInfo = "";
        if (existing.userId) existingInfo += `ID: ${existing.userId} `;
        if (existing.username) existingInfo += `Username: ${existing.username} `;
        if (existing.link) existingInfo += `Link: ${existing.link} `;
        if (existing.stk) existingInfo += `STK: ${existing.stk} `;
        if (existing.phone) existingInfo += `SĐT: ${existing.phone} `;

        return api.sendMessage(`⚠️ Thông tin đã tồn tại!\n📋 Thông tin trùng: ${existingInfo.trim()}`, threadID, messageID);
      }

      scamData.scammers.push(scammer);

      if (writeScamData(scamData)) {
        let msg = `✅ Đã thêm thành công!\n📋 Loại: ${scamType.toUpperCase()}\n`;
        if (scammer.link) msg += `🔗 Link: ${scammer.link}\n`;
        if (scammer.userId) msg += `🆔 Facebook ID: ${scammer.userId}\n`;
        if (scammer.username) msg += `👤 Username: ${scammer.username}\n`;
        if (scammer.stk) msg += `💳 STK: ${scammer.stk}\n`;
        if (scammer.bankName) msg += `🏦 Ngân hàng: ${scammer.bankName}\n`;
        if (scammer.phone) msg += `📱 SĐT: ${scammer.phone}\n`;
        if (scammer.description) msg += `📝 Mô tả: ${scammer.description}\n`;
        msg += `📅 Ngày thêm: ${new Date(dateAdded).toLocaleDateString('vi-VN')}`;

        if (scamType === 'link' && (scammer.userId || scammer.username)) {
          msg += `\n\n🔍 Đã tự động trích xuất thông tin từ link!`;
        }

        return api.sendMessage(msg, threadID, messageID);
      } else {
        return api.sendMessage("❌ Có lỗi khi lưu dữ liệu!", threadID, messageID);
      }
    }

    case "remove": {
      if (args.length < 2) return api.sendMessage("❌ Vui lòng nhập ID cần xóa", threadID, messageID);
      const id = args[1];
      const idx = scamData.scammers.findIndex(s => s.userId === id || s.stk === id || s.phone === id || s.link === id);
      if (idx === -1) return api.sendMessage("❌ Không tìm thấy scammer với ID này!", threadID, messageID);
      const removed = scamData.scammers.splice(idx, 1)[0];
      if (writeScamData(scamData)) {
         const info = removed.link || removed.userId || removed.stk || removed.phone || "Không xác định";
        return api.sendMessage(`✅ Đã xóa thành công scammer:\n📄 Thông tin: ${info}`, threadID, messageID);
      } else {
        return api.sendMessage("❌ Có lỗi khi xóa dữ liệu!", threadID, messageID);
      }
    }

    default:
      return api.sendMessage("❌ Lệnh không hợp lệ! Chỉ sử dụng: add, remove", threadID, messageID);
  }
};