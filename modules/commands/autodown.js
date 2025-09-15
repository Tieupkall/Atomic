const fs = require("fs-extra");
const path = require("path");

module.exports.config = {
  name: "autodown",
  version: "2.1.0",
  hasPermssion: 1,
  credits: "atomic",
  description: "Bật/tắt tự động tải video TikTok và YouTube",
  commandCategory: "Quản Trị Viên",
  usages: "[on/off/status]",
  cooldowns: 5
};

module.exports.run = async function({ api, event, args, Threads }) {
  const { threadID, messageID } = event;
  const action = args[0]?.toLowerCase();

  if (!action || !["on", "off", "status"].includes(action)) {
    return api.sendMessage("❌ Cú pháp: autodown [on/off/status]\n\n• on - Bật tự động tải video\n• off - Tắt tự động tải video\n• status - Xem trạng thái hiện tại", threadID, messageID);
  }

  try {
    let data = (await Threads.getData(threadID)).data || {};

    switch (action) {
      case "on":
        data.autodown = true;
        await Threads.setData(threadID, { data });
        return api.sendMessage("✅ Đã bật Autodown! Bot sẽ tự động tải video khi phát hiện link", threadID, messageID);

      case "off":
        data.autodown = false;
        await Threads.setData(threadID, { data });
        return api.sendMessage("❌ Đã tắt Autodown!", threadID, messageID);

      case "status":
        const status = data.autodown ? "Đang bật" : "Đang tắt";
        return api.sendMessage(`📊 Trạng thái Autodown: ${status}`, threadID, messageID);
    }
  } catch (err) {
    console.error(err);
    return api.sendMessage("❌ Có lỗi xảy ra khi thay đổi cài đặt!", threadID, messageID);
  }
};