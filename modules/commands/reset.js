
const fs = require('fs');
const path = require('path');

module.exports.config = {
  name: "reset",
  version: "1.0.0",
  hasPermission: 2, // Chỉ admin
  credits: "Atomic",
  description: "Reset/khôi phục chỉ số game tu tiên về ban đầu",
  commandCategory: "Admin",
  usages: "[reset]",
  cooldowns: 0,
  hide: true // Ẩn lệnh khỏi help
};

module.exports.run = async ({ event, api, args, Threads, Users }) => {
  const { threadID, messageID, senderID } = event;
  
  // Kiểm tra quyền admin
  const adminList = global.config.ADMINBOT || [];
  if (!adminList.includes(senderID)) {
    return; // Không phản hồi gì nếu không phải admin
  }

  const DATA_DIR = './data/tienhiep';
  const PLAYERS_DIR = path.join(DATA_DIR, 'players');

  // Kiểm tra sự tồn tại của thư mục dữ liệu
  if (!fs.existsSync(PLAYERS_DIR)) {
    return api.sendMessage("❌ Thư mục dữ liệu không tồn tại!", threadID, messageID);
  }

  // Dữ liệu mặc định cho người chơi mới
  const defaultPlayerData = {
    name: "",
    level: 1,
    exp: 0,
    maxExp: 100,
    hp: 100,
    maxHp: 100,
    mp: 50,
    maxMp: 50,
    attack: 10,
    defense: 5,
    stage: "Luyện_khí_kỳ",
    subStage: "sơ_kỳ",
    spiritStones: 5000,
    spiritPower: 100,
    maxSpiritPower: 100,
    lastHuntTime: null,
    spiritPowerRecoveryTime: null,
    injuredUntil: null,
    weaponType: "",
    inventory: [],
    equipment: {
      weapon: null,
      armor: null,
      accessory: null
    }
  };

  // Đọc danh sách file người chơi
  const playerFiles = fs.readdirSync(PLAYERS_DIR);
  let resetCount = 0;
  let errors = [];

  // Reset từng file người chơi
  playerFiles.forEach(file => {
    if (file.endsWith('.json')) {
      try {
        const filePath = path.join(PLAYERS_DIR, file);
        const playerID = file.replace('.json', '');
        
        // Đọc dữ liệu hiện tại (nếu có)
        let currentData = {};
        if (fs.existsSync(filePath)) {
          try {
            currentData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
          } catch (e) {
            console.log(`Không thể đọc dữ liệu cũ của ${file}, tạo mới`);
          }
        }

        // Tạo dữ liệu reset với ID và tên (nếu có), giữ lại inventory và equipment
        const resetData = {
          ...defaultPlayerData,
          id: playerID,
          name: currentData.name || "",
          weaponType: currentData.weaponType || "",
          createdAt: currentData.createdAt || new Date().toISOString(),
          lastActiveAt: new Date().toISOString(),
          // Giữ lại inventory và equipment nếu có
          inventory: currentData.inventory || [],
          equipment: currentData.equipment || {
            weapon: null,
            armor: null,
            accessory: null
          }
        };

        // Ghi dữ liệu đã reset
        fs.writeFileSync(filePath, JSON.stringify(resetData, null, 2), 'utf8');
        resetCount++;
      } catch (error) {
        errors.push(file);
        console.error(`Error resetting ${file}:`, error);
      }
    }
  });

  let resultMessage = `🔄 RESET CHỈ SỐ HOÀN TẤT!\n\n`;
  resultMessage += `✅ Đã reset: ${resetCount} tài khoản\n`;
  resultMessage += `📊 Chỉ số đã khôi phục về ban đầu:\n`;
  resultMessage += `   • Cấp độ: 1\n`;
  resultMessage += `   • Kinh nghiệm: 0\n`;
  resultMessage += `   • Máu: 100/100\n`;
  resultMessage += `   • Nội lực: 50/50\n`;
  resultMessage += `   • Linh thạch: 5000\n`;
  resultMessage += `   • Cảnh giới: Trúc Cơ - Sơ Kỳ\n`;
  if (errors.length > 0) {
    resultMessage += `❌ Lỗi: ${errors.length} file (${errors.join(', ')})\n`;
  }
  resultMessage += `\n🕐 Thời gian: ${new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}`;

  return api.sendMessage(resultMessage, threadID, messageID);
};
