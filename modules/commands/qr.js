const { sendQRToGroup } = require("../utils/qr.js");

module.exports.config = {
  name: "qr",
  version: "1.0.0",
  hasPermssion: 0,
  credits: "Atomic",
  description: "Tạo QR code thanh toán để kích hoạt/gia hạn bot",
  commandCategory: "Banking",
  usages: "qr [số tiền] [activate|renew]",
  cooldowns: 5
};

module.exports.run = async ({ api, event, args }) => {
  const options = {};
  if (args[0]) {
    const amt = parseInt(args[0], 10);
    if (!isNaN(amt)) options.amount = amt;
  }
  if (args[1]) options.purpose = args[1].toLowerCase() === "renew" ? "renew" : "activate";
  try {
    await sendQRToGroup(api, event.threadID, options);
  } catch (e) {
    api.sendMessage("❌ Lỗi khi tạo QR: " + e.message, event.threadID, event.messageID);
  }
};