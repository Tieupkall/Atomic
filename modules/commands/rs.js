module.exports.config = {
  name: "rs",
  version: "1.0.3",
  hasPermssion: 3,
  credits: "Atomic",
  description: "Khởi động lại bot với thông báo hoàn thành",
  commandCategory: "Admin",
  usages: "[rs]",
  cooldowns: 5,
  dependencies: {}
}

module.exports.run = async function({ api, args, Users, event }) {
  const { threadID, messageID } = event;
  const moment = require("moment-timezone");
  const fs = require('fs-extra');
  const path = require('path');

  var gio = moment.tz("Asia/Ho_Chi_Minh").format("HH");
  var phut = moment.tz("Asia/Ho_Chi_Minh").format("mm");
  var giay = moment.tz("Asia/Ho_Chi_Minh").format("ss");

  let name = await Users.getNameUser(event.senderID);

  if (args.length == 0) {
    const restartConfig = {
      threadID: threadID,
      timestamp: Date.now(),
      requester: name,
      messageID: messageID
    };
    
    console.log('💾 [RS] Đang lưu config restart:', restartConfig);
    
    // Đảm bảo thư mục data tồn tại
    const dataDir = path.join(__dirname, '..', '..', 'data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
      console.log('📁 [RS] Đã tạo thư mục data');
    }
    
    const configPath = path.join(dataDir, 'restart_config.json');
    console.log('💾 [RS] Config path:', configPath);
    
    try {
      fs.writeFileSync(configPath, JSON.stringify(restartConfig, null, 2));
      console.log('✅ [RS] Config đã lưu thành công');
    } catch (error) {
      console.log('❌ [RS] Lỗi khi lưu config:', error.message);
    }
    
    // Gửi thông báo bắt đầu restart
    const startMessage = `🔄 Bot đang khởi động lại...\n⏰ Thời gian bắt đầu: ${gio}:${phut}:${giay}\n👤 Được yêu cầu bởi: ${name}\n⌛ Vui lòng đợi 10-15 giây để bot khởi động hoàn tất...`;
    
    api.sendMessage(startMessage, threadID, messageID);

    // Delay trước khi restart để đảm bảo message được gửi
    setTimeout(() => {
      console.log('🔄 [RS] Đang restart bot...');
      process.exit(1);
    }, 2000);
  }
}