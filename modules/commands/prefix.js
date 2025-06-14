const moment = require("moment-timezone");

module.exports.config = {
  name: "prefix",
  version: "2.0.0",
  hasPermission: 0,
  credits: "DongDev",
  description: "Hiển thị prefix và thông tin bot",
  commandCategory: "Thành Viên",
  usages: "[]",
  cooldowns: 0
};

module.exports.handleEvent = async function ({ api, event }) {
  const { threadID, body } = event;
  const { PREFIX } = global.config;
  const gio = moment.tz("Asia/Ho_Chi_Minh").format("HH:mm:ss || DD/MM/YYYY");

  let threadSetting = global.data.threadData.get(threadID) || {};
  let prefix = threadSetting.PREFIX || PREFIX;

  const lowerBody = body?.toLowerCase();

  if (
    lowerBody === "prefix" ||
    lowerBody === "dùng bot kiểu gì" ||
    lowerBody === "dùng bot như nào" ||
    lowerBody === "dùng sao"
  ) {
    api.sendMessage(
      `==== [ PREFIX BOT ] ====
──────────────────
✏️ Prefix của nhóm: ${prefix}
📎 Prefix hệ thống: ${global.config.PREFIX}
📝 Tổng lệnh: ${global.client.commands.size}
👥 Người dùng bot: ${global.data.allUserID.length}
🏘️ Nhóm sử dụng bot: ${global.data.allThreadID.length}
──────────────────
⏰ Time: ${gio}`,
      threadID,
      event.messageID
    );
  }
};

module.exports.run = async function () {};