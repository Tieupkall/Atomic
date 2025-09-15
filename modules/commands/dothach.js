const fs = require('fs');
const path = require('path');

// Đường dẫn đến data của tienhiep để dùng chung linh thạch
const TIENHIEP_DATA_DIR = './data/tienhiep';
const PLAYERS_DIR = path.join(TIENHIEP_DATA_DIR, 'players');

// Cấu hình các loại đá
const STONE_TYPES = {
  1: {
    name: "🪨 Đá Thường",
    price: 300,
    minValue: 1,
    maxValue: 3000,
    description: "Đá cơ bản, có thể ra vật phẩm giá trị 1-3000 linh thạch"
  },
  2: {
    name: "💎 Đá Quý",
    price: 800,
    minValue: 100,
    maxValue: 5000,
    description: "Đá cao cấp, có thể ra vật phẩm giá trị 100-5000 linh thạch"
  },
  3: {
    name: "✨ Đá Huyền Bí",
    price: 1800,
    minValue: 500,
    maxValue: 10000,
    description: "Đá siêu hiếm, có thể ra vật phẩm giá trị 500-10000 linh thạch"
  }
};

// Danh sách vật phẩm có thể nhận được
const STONE_REWARDS = [
  // Vật phẩm giá trị thấp (1-1000)
  { name: "Mảnh Sắt", value: 5, rarity: "Thường", type: "vật liệu" },
  { name: "Ngọc Thô", value: 15, rarity: "Thường", type: "ngọc" },
  { name: "Tinh Thể Nhỏ", value: 25, rarity: "Thường", type: "tinh túy" },
  { name: "Đá Lửa", value: 50, rarity: "Hiếm", type: "vật liệu" },
  { name: "Bạc Nguyên Chất", value: 100, rarity: "Hiếm", type: "vật liệu" },
  { name: "Ngọc Lam", value: 150, rarity: "Hiếm", type: "ngọc" },
  { name: "Tinh Thể Băng", value: 200, rarity: "Hiếm", type: "tinh túy" },
  { name: "Linh Thạch Nhỏ", value: 250, rarity: "Quý", type: "tiền tệ" },
  { name: "Vàng Nguyên Chất", value: 300, rarity: "Quý", type: "vật liệu" },
  { name: "Ngọc Huyết", value: 400, rarity: "Quý", type: "ngọc" },
  { name: "Tinh Thể Lôi", value: 500, rarity: "Quý", type: "tinh túy" },
  { name: "Linh Thạch Trung", value: 750, rarity: "Cực Hiếm", type: "tiền tệ" },
  { name: "Kim Cương Thô", value: 1000, rarity: "Cực Hiếm", type: "ngọc" },

  // Đan dược (sẽ không bị auto sell)
  { name: "Hồi Nguyên Đan", value: 150, rarity: "Hiếm", type: "đan dược", rare: true },
  { name: "Thiên Tâm Đan", value: 350, rarity: "Quý", type: "đan dược", rare: true },
  { name: "Bạch Cốt Đan", value: 800, rarity: "Cực Hiếm", type: "đan dược", rare: true },
  { name: "Long Huyết Đan", value: 1500, rarity: "Thần Thoại", type: "đan dược", rare: true },

  // Vật phẩm giá trị trung (100-5000)
  { name: "Huyền Thiết", value: 1500, rarity: "Cực Hiếm", type: "vật liệu" },
  { name: "Ngọc Phượng Hoàng", value: 2000, rarity: "Thần Thoại", type: "ngọc" },
  { name: "Tinh Thể Long", value: 2500, rarity: "Thần Thoại", type: "tinh túy" },
  { name: "Linh Thạch Lớn", value: 3000, rarity: "Thần Thoại", type: "tiền tệ" },
  { name: "Thiên Kim", value: 3500, rarity: "Thần Thoại", type: "vật liệu" },
  { name: "Ngọc Kỳ Lân", value: 4000, rarity: "Huyền Thoại", type: "ngọc", rare: true },
  { name: "Tinh Thể Hỗn Độn", value: 4500, rarity: "Huyền Thoại", type: "tinh túy" },
  { name: "Linh Thạch Siêu Lớn", value: 5000, rarity: "Huyền Thoại", type: "tiền tệ" },

  // Vật phẩm giá trị cao (500-10000)
  { name: "Thiên Thiết", value: 6000, rarity: "Huyền Thoại", type: "vật liệu" },
  { name: "Ngọc Thái Cổ", value: 7000, rarity: "Vô Cực", type: "ngọc", rare: true },
  { name: "Tinh Thể Thái Thượng", value: 8000, rarity: "Vô Cực", type: "tinh túy", rare: true },
  { name: "Linh Thạch Thần Thánh", value: 9000, rarity: "Tối Thượng", type: "tiền tệ" },
  { name: "Hỗn Thiên Bảo Ngọc", value: 10000, rarity: "Tối Thượng", type: "ngọc", rare: true }
];

// Load và save data player từ tienhiep
function loadData(filePath) {
  try {
    if (!fs.existsSync(filePath)) {
      return null;
    }
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    console.error(`Error loading ${filePath}:`, error);
    return null;
  }
}

function saveData(filePath, data) {
  try {
    // Ensure directory exists
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
    return true;
  } catch (error) {
    console.error(`Error saving ${filePath}:`, error);
    return false;
  }
}

function getPlayerPath(userID) {
  return path.join(PLAYERS_DIR, `${userID}.json`);
}

function loadPlayer(userID) {
  const playerPath = getPlayerPath(userID);
  return loadData(playerPath);
}

function savePlayer(userID, data) {
  const playerPath = getPlayerPath(userID);
  data.lastActive = new Date().toISOString();
  return saveData(playerPath, data);
}

// Hàm random vật phẩm theo giá trị
function getRandomReward(minValue, maxValue) {
  const availableRewards = STONE_REWARDS.filter(reward => 
    reward.value >= minValue && reward.value <= maxValue
  );

  if (availableRewards.length === 0) {
    return null;
  }

  // Tính trọng số ngược (vật phẩm giá trị cao có tỷ lệ thấp hơn)
  // Giảm 10% tỉ lệ ra nguyên liệu cao cấp
  const weightedRewards = [];
  availableRewards.forEach(reward => {
    let weight = Math.max(1, Math.floor((maxValue - reward.value) / 100) + 1);

    // Giảm thêm 10% trọng số cho vật phẩm cao cấp (giá trị > 1000)
    if (reward.value > 1000) {
      weight = Math.max(1, Math.floor(weight * 0.9));
    }

    for (let i = 0; i < weight; i++) {
      weightedRewards.push(reward);
    }
  });

  const randomIndex = Math.floor(Math.random() * weightedRewards.length);
  return weightedRewards[randomIndex];
}

// Hàm thêm vật phẩm vào inventory (nếu có)
function addRewardToPlayer(player, reward) {
  if (reward.type === "tiền tệ") {
    // Nếu là linh thạch thì cộng trực tiếp
    player.spiritStones = (player.spiritStones || 0) + reward.value;
  } else {
    // Nếu là vật phẩm thì thêm vào inventory (nếu player có hệ thống inventory)
    if (!player.inventory) {
      player.inventory = [];
    }

    const item = {
      id: Date.now() + Math.random(), // Add unique ID
      name: reward.name,
      type: reward.type,
      rarity: reward.rarity,
      sellPrice: reward.value,
      buyPrice: reward.value * 3,
      description: `Vật phẩm từ đổ thạch - ${reward.rarity}`,
      obtainedAt: new Date().toISOString(),
      source: "Đổ thạch",
      category: "stone_breaking" // Đánh dấu vật phẩm từ đổ thạch
    };

    player.inventory.push(item);
  }
}

// Hàm lấy icon rarity
function getRarityIcon(rarity) {
  const icons = {
    "Thường": "⚪",
    "Hiếm": "🟢",
    "Quý": "🔵",
    "Cực Hiếm": "🟣",
    "Thần Thoại": "🟡",
    "Huyền Thoại": "🔴",
    "Vô Cực": "⚫",
    "Tối Thượng": "✨"
  };
  return icons[rarity] || "⚪";
}

// Hàm format thời gian
function formatTime(date) {
  return new Intl.DateTimeFormat('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  }).format(date);
}

// Hàm auto bán các vật phẩm có giá trị thấp
function autoSellItems(player, rewards) {
  let totalEarned = 0;
  const soldItems = [];
  const keepItems = [];

  // Kiểm tra setting auto sell (mặc định là true)
  const autoSellEnabled = player.settings?.autoSell !== false;

  for (const reward of rewards) {
    // Không bán tiền tệ, đan dược và vật phẩm quý hiếm
    const shouldKeep = reward.type === "tiền tệ" || 
                      reward.type === "đan dược" || 
                      reward.rare === true;

    if (autoSellEnabled && !shouldKeep) {
      totalEarned += reward.value;
      soldItems.push(reward);
    } else {
      keepItems.push(reward);
    }
  }

  player.spiritStones = (player.spiritStones || 0) + totalEarned;
  return { soldItems, totalEarned, keepItems };
}

// Hàm xử lý đổ thạch chính
function processStoneBreaking(player, stoneType, quantity) {
  const stone = STONE_TYPES[stoneType];
  const totalCost = stone.price * quantity;

  // Kiểm tra đủ linh thạch
  if ((player.spiritStones || 0) < totalCost) {
    return {
      success: false,
      error: `❌ Không đủ linh thạch!\n💎 Cần: ${totalCost.toLocaleString()}\n💰 Có: ${(player.spiritStones || 0).toLocaleString()}\n💎 Thiếu: ${(totalCost - (player.spiritStones || 0)).toLocaleString()}`
    };
  }

  // Trừ linh thạch
  player.spiritStones = (player.spiritStones || 0) - totalCost;

  // Đổ thạch và thu thập kết quả
  const results = [];
  let totalValue = 0;

  for (let i = 0; i < quantity; i++) {
    const reward = getRandomReward(stone.minValue, stone.maxValue);
    if (reward) {
      results.push(reward);
      totalValue += reward.value;
    }
  }

  // Xử lý auto bán
  const { soldItems, totalEarned, keepItems } = autoSellItems(player, results);

  // Thêm các vật phẩm được giữ lại vào inventory
  keepItems.forEach(reward => {
    addRewardToPlayer(player, reward);
  });

  return {
    success: true,
    results: keepItems,
    soldItems,
    totalEarned,
    totalValue,
    totalCost,
    stone,
    quantity
  };
}

// Hàm tạo thông báo kết quả
function createResultMessage(player, processResult) {
  const { results, soldItems, totalEarned, totalValue, totalCost, stone, quantity } = processResult;

  let resultMsg = `🪨 KẾT QUẢ ĐỔ THẠCH:\n\n`;
  resultMsg += `${stone.name} x${quantity} - 💎${totalCost.toLocaleString()}\n\n`;

  // Hiển thị vật phẩm được giữ lại
  if (results.length > 0) {
    resultMsg += `🎁 VẬT PHẨM NHẬN ĐƯỢC:\n`;

    // Gộp các vật phẩm giống nhau
    const groupedResults = {};
    results.forEach(reward => {
      const key = reward.name;
      if (!groupedResults[key]) {
        groupedResults[key] = { ...reward, count: 0 };
      }
      groupedResults[key].count++;
    });

    Object.values(groupedResults).forEach(reward => {
      const rarityIcon = getRarityIcon(reward.rarity);
      const countText = reward.count > 1 ? ` x${reward.count}` : "";
      resultMsg += `${rarityIcon} ${reward.name}${countText} - 💎${(reward.value * reward.count).toLocaleString()}\n`;
    });
  }

  // Hiển thị vật phẩm đã auto bán
  if (soldItems.length > 0) {
    resultMsg += `\n💰 AUTO SELL:\n`;

    const groupedSold = {};
    soldItems.forEach(item => {
      const key = item.name;
      if (!groupedSold[key]) {
        groupedSold[key] = { ...item, count: 0 };
      }
      groupedSold[key].count++;
    });

    Object.values(groupedSold).forEach(item => {
      const rarityIcon = getRarityIcon(item.rarity);
      const countText = item.count > 1 ? ` x${item.count}` : "";
      resultMsg += `${rarityIcon} ${item.name}${countText} - 💎${(item.value * item.count).toLocaleString()}\n`;
    });

    resultMsg += `💰 Thu về: ${totalEarned.toLocaleString()} linh thạch\n`;
  }

  const finalTotalValue = totalValue + totalEarned;
  if (results.length > 0 || soldItems.length > 0) {
    resultMsg += `\n💰 Tổng giá trị: ${finalTotalValue.toLocaleString()} linh thạch\n`;
    resultMsg += `📈 Lãi/Lỗ: ${finalTotalValue >= totalCost ? '+' : ''}${(finalTotalValue - totalCost).toLocaleString()} linh thạch\n`;
  } else {
    resultMsg += `💨 Không nhận được gì... Thật không may!\n`;
  }

  resultMsg += `\n📊 TRẠNG THÁI:\n`;
  resultMsg += `💎 Linh thạch còn lại: ${(player.spiritStones || 0).toLocaleString()}\n`;
  resultMsg += `🕐 ${formatTime(new Date())}`;

  return resultMsg;
}

// Hàm hiển thị settings
function showSettings(api, event, userID, player) {
  if (!player.settings) {
    player.settings = { autoSell: true };
  }

  const autoSellStatus = player.settings.autoSell !== false ? "🟢 ON" : "🔴 OFF";

  let settingsMsg = `⚙️ CÀI ĐẶT ĐỔ THẠCH:\n\n`;
  settingsMsg += `🤖 Auto Sell: ${autoSellStatus}\n`;
  settingsMsg += `   Tự động bán tất cả các vật phẩm \n\n`;
  settingsMsg += `💡 CÁCH SỬ DỤNG:\n`;
  settingsMsg += `• Reply "on" hoặc "off" - Bật/tắt auto sell\n`;
  settingsMsg += `• Reply "menu" - Quay lại menu chính\n`;

  return api.sendMessage(settingsMsg, event.threadID, (error, info) => {
    if (!error && global.client?.handleReply) {
      global.client.handleReply.push({
        name: module.exports.config.name,
        messageID: info.messageID,
        author: userID,
        type: 'autosell'
      });
    }
  }, event.messageID);
}

// Hàm toggle auto sell
function toggleAutoSell(api, event, userID, player, input) {
  if (!player.settings) {
    player.settings = { autoSell: true };
  }

  // Toggle auto sell
  if (input === 'on') {
    player.settings.autoSell = true;
  } else if (input === 'off') {
    player.settings.autoSell = false;
  } else {
    return api.sendMessage("❌ Lựa chọn không hợp lệ! Hãy reply 'on' hoặc 'off'.", event.threadID, event.messageID);
  }

  // Lưu dữ liệu
  if (!savePlayer(userID, player)) {
    return api.sendMessage("❌ Có lỗi xảy ra khi lưu cài đặt!", event.threadID, event.messageID);
  }

  const status = player.settings.autoSell ? "🟢 ON" : "🔴 OFF";
  let toggleMsg = `✅ ĐÃ CẬP NHẬT CÀI ĐẶT!\n\n`;
  toggleMsg += `🤖 Auto Sell: ${status}\n\n`;

  if (player.settings.autoSell) {
    toggleMsg += `💡 Tất cả vật phẩm sẽ được tự động bán`;
  } else {
    toggleMsg += `💡 Tất cả vật phẩm sẽ được giữ lại trong inventory`;
  }

  return api.sendMessage(toggleMsg, event.threadID, (error, info) => {
    if (!error && global.client?.handleReply) {
      global.client.handleReply.push({
        name: module.exports.config.name,
        messageID: info.messageID,
        author: userID,
        type: 'autosell'
      });
    }
  }, event.messageID);
}

module.exports.config = {
  name: "dothach",
  version: "1.0.0",
  hasPermission: 0,
  credits: "Atomic",
  description: "Đổ thạch để nhận vật phẩm ngẫu nhiên",
  commandCategory: "Tu tiên",
  usages: "[số loại đá] [số lượng]",
  cooldowns: 5
};

module.exports.handleReply = async ({ api, event, handleReply }) => {
  const userID = event.senderID;

  // Kiểm tra quyền reply
  if (handleReply.author !== userID) {
    return api.sendMessage("❌ Bạn không thể sử dụng reply này!", event.threadID, event.messageID);
  }

  const player = loadPlayer(userID);
  if (!player) {
    return api.sendMessage("❌ Bạn chưa tạo nhân vật tu tiên! Hãy sử dụng lệnh `.tu` để tạo nhân vật trước.", event.threadID, event.messageID);
  }

  const input = event.body.trim().toLowerCase();

  // Xử lý quay lại menu chính
  if (input === 'menu') {
    const prefix = global.config?.PREFIX || '.';
    let menuText = `🪨 CỬA HÀNG ĐỔ THẠCH:\n\n`;
    menuText += `💎 Linh thạch hiện có: ${(player.spiritStones || 0).toLocaleString()}\n\n`;

    Object.entries(STONE_TYPES).forEach(([id, stone]) => {
      menuText += `${id}. ${stone.name} - 💎${stone.price.toLocaleString()}\n`;
      menuText += `   📋 ${stone.description}\n`;
      menuText += `   🎁 Phần thưởng: ${stone.minValue.toLocaleString()}-${stone.maxValue.toLocaleString()} linh thạch\n\n`;
    });

    menuText += `💡 CÁCH SỬ DỤNG:\n`;
    menuText += `• ${prefix}dothach [số loại đá] - Đổ 1 viên\n`;
    menuText += `• ${prefix}dothach [số loại đá] [số lượng] - Đổ nhiều viên\n`;
    menuText += `• Reply tin nhắn này:\n`;
    menuText += `  - [số loại đá] [số lượng] - Đổ thạch nhanh\n`;
    menuText += `  - "auto" - Cấu hình auto sell\n\n`;

    const autoSellStatus = player.settings?.autoSell !== false ? "🟢 ON" : "🔴 OFF";
    menuText += `🤖 Auto Sell: ${autoSellStatus} (Giữ lại đan dược & vật phẩm quý)`;

    return api.sendMessage(menuText, event.threadID, (error, info) => {
      if (!error && global.client?.handleReply) {
        global.client.handleReply.push({
          name: module.exports.config.name,
          messageID: info.messageID,
          author: userID,
          type: 'main'
        });
      }
    }, event.messageID);
  }

  // Xử lý mở menu auto sell khi reply 'auto'
  if (input === 'auto') {
    return showSettings(api, event, userID, player);
  }

  // Xử lý toggle auto sell
  if (handleReply.type === 'autosell' && (input === 'on' || input === 'off')) {
    return toggleAutoSell(api, event, userID, player, input);
  }

  const args = input.split(' ');
  const stoneType = parseInt(args[0]);
  const quantity = Math.max(1, Math.min(50, parseInt(args[1]) || 1));

  if (!STONE_TYPES[stoneType] || stoneType < 1 || stoneType > 3) {
    return api.sendMessage("❌ Loại đá không hợp lệ! Chọn từ 1-3.", event.threadID, event.messageID);
  }

  // Xử lý đổ thạch
  const processResult = processStoneBreaking(player, stoneType, quantity);

  if (!processResult.success) {
    return api.sendMessage(processResult.error, event.threadID, event.messageID);
  }

  // Lưu dữ liệu player
  if (!savePlayer(userID, player)) {
    return api.sendMessage("❌ Có lỗi xảy ra khi lưu dữ liệu!", event.threadID, event.messageID);
  }

  // Tạo và gửi thông báo kết quả
  const resultMsg = createResultMessage(player, processResult);
  return api.sendMessage(resultMsg, event.threadID, event.messageID);
};

module.exports.run = async ({ event, api, args }) => {
  const userID = event.senderID;
  const player = loadPlayer(userID);

  if (!player) {
    return api.sendMessage("❌ Bạn chưa tạo nhân vật tu tiên! Hãy sử dụng lệnh `.tu` để tạo nhân vật trước.", event.threadID, event.messageID);
  }

  const prefix = global.config?.PREFIX || '.';
  const choice = args[0];
  const quantity = Math.max(1, Math.min(50, parseInt(args[1]) || 1));

  if (!choice) {
    // Hiển thị menu chính với tùy chọn reply
    let menuText = `🪨 CỬA HÀNG ĐỔ THẠCH:\n\n`;
    menuText += `💎 Linh thạch hiện có: ${(player.spiritStones || 0).toLocaleString()}\n\n`;

    Object.entries(STONE_TYPES).forEach(([id, stone]) => {
      menuText += `${id}. ${stone.name} - 💎${stone.price.toLocaleString()}\n`;
      menuText += `   📋 ${stone.description}\n`;
      menuText += `   🎁 Phần thưởng: ${stone.minValue.toLocaleString()}-${stone.maxValue.toLocaleString()} linh thạch\n\n`;
    });

    menuText += `💡 CÁCH SỬ DỤNG:\n`;
    menuText += `• ${prefix}dothach [STT] - Đổ 1 viên\n`;
    menuText += `• ${prefix}dothach [STT] [số lượng] - Đổ nhiều viên\n`;
    menuText += `  - Reply [STT] [số lượng] - Đổ thạch nhanh\n`;
    menuText += `  - Reply "auto" - Cấu hình auto sell\n\n`;

    const autoSellStatus = player.settings?.autoSell !== false ? "🟢 ON" : "🔴 OFF";
    menuText += `🤖 Auto Sell: ${autoSellStatus} (Giữ lại đan dược & vật phẩm quý)`;

    return api.sendMessage(menuText, event.threadID, (error, info) => {
      if (!error && global.client?.handleReply) {
        global.client.handleReply.push({
          name: module.exports.config.name,
          messageID: info.messageID,
          author: userID,
          type: 'main'
        });
      }
    });
  }

  const stoneType = parseInt(choice);
  if (!STONE_TYPES[stoneType] || stoneType < 1 || stoneType > 3) {
    return api.sendMessage("❌ Loại đá không hợp lệ! Chọn từ 1-3.", event.threadID, event.messageID);
  }

  // Xử lý đổ thạch
  const processResult = processStoneBreaking(player, stoneType, quantity);

  if (!processResult.success) {
    return api.sendMessage(processResult.error, event.threadID, event.messageID);
  }

  // Lưu dữ liệu player
  if (!savePlayer(userID, player)) {
    return api.sendMessage("❌ Có lỗi xảy ra khi lưu dữ liệu!", event.threadID, event.messageID);
  }

  // Tạo và gửi thông báo kết quả
  const resultMsg = createResultMessage(player, processResult);
  return api.sendMessage(resultMsg, event.threadID, event.messageID);
};