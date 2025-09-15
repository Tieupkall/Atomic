const fs = require("fs");
const path = require("path");
const RandomDelay = require("../utils/RandomDelay.js");

function ensureThreadFiles(threadID) {
  const dir = path.join(__dirname, "..", "..", "data", "sellinfo", threadID);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

async function checkPermissions(event, api) {
  const { threadID, senderID } = event;
  
  // Safely check bot admin
  let isAdminBot = false;
  try {
    if (global.config && global.config.ADMIN && Array.isArray(global.config.ADMIN)) {
      isAdminBot = global.config.ADMIN.includes(senderID);
    }
  } catch (error) {
    console.error("Error checking bot admin:", error);
  }
  
  // Check group admin
  let isAdminGroup = false;
  try {
    const threadInfo = await api.getThreadInfo(threadID);
    if (threadInfo && threadInfo.adminIDs) {
      isAdminGroup = threadInfo.adminIDs.some(admin => admin.id === senderID);
    }
  } catch (error) {
    console.error("Error checking group admin:", error);
  }
  
  return isAdminBot || isAdminGroup;
}

module.exports.config = {
  name: "sell",
  version: "1.2.0",
  hasPermssion: 0,
  credits: "Atomic", 
  description: "Hiển thị thông tin giá vật phẩm",
  commandCategory: "SellInfo",
  usages: "[sell]",
  cooldowns: 5,
  dependencies: {}
};

module.exports.handleReply = async function({ event, api, handleReply }) {
  const { threadID, messageID, body, senderID } = event;
  const userInput = body.trim();
  const dir = ensureThreadFiles(threadID);

  // Parse command and arguments
  const args = userInput.split(" ");
  const command = args[0].toLowerCase();

  // Check permissions for commands
  const hasPermission = await checkPermissions(event, api);

  // Apply RandomDelay
  await RandomDelay.delay({
    commandType: 'normal',
    messageLength: userInput.length,
    senderID: senderID,
    threadID: threadID,
    commandName: 'sell',
    hasPermission: hasPermission ? 2 : 0
  }, api);

  // Handle commands that require permission
  if (["add", "create", "delete", "del", "list"].includes(command)) {
    if (!hasPermission) {
      return api.sendMessage("⚠️ Bạn không có quyền sử dụng lệnh này.", threadID, messageID);
    }

    // Handle create command
    if (command === "create") {
      const newFileName = args.slice(1).join(" ");

      if (!newFileName) {
        return api.sendMessage("⚠️ Vui lòng cung cấp tên tệp mới.\nVí dụ: create Giá thú", threadID, messageID);
      }

      const filePath = path.join(dir, `${newFileName}.json`);

      if (fs.existsSync(filePath)) {
        return api.sendMessage(`⚠️ Tệp "${newFileName}.json" đã tồn tại.`, threadID, messageID);
      }

      try {
        fs.writeFileSync(filePath, "❌ Chưa có thông tin!", "utf-8");
        return api.sendMessage(`✅ Đã thêm vào menu "${newFileName}.json".`, threadID, messageID);
      } catch (error) {
        console.error("Error creating file:", error);
        return api.sendMessage("❌ Không thể tạo tệp mới.", threadID, messageID);
      }
    }

    // Handle add command
    if (command === "add") {
      const menuIndex = parseInt(args[1]);
      const content = args.slice(2).join(" ");

      if (isNaN(menuIndex) || !content) {
        return api.sendMessage("⚠️ Bạn cần cung cấp số thứ tự menu và nội dung để thêm vào.\nVí dụ: add 1 Thông tin giá cả", threadID, messageID);
      }

      // Get available files to map index to filename
      const availableFiles = fs.readdirSync(dir)
        .filter(file => file.endsWith(".json"))
        .map(file => path.basename(file, ".json"));

      if (availableFiles.length === 0) {
        return api.sendMessage("⚠️ Chưa có tệp nào được tạo. Vui lòng tạo tệp trước bằng lệnh: create [tên_tệp]", threadID, messageID);
      }

      if (menuIndex < 1 || menuIndex > availableFiles.length) {
        return api.sendMessage(`⚠️ Số thứ tự không hợp lệ. Vui lòng chọn từ 1 đến ${availableFiles.length}.`, threadID, messageID);
      }

      const fileName = availableFiles[menuIndex - 1];
      const filePath = path.join(dir, `${fileName}.json`);

      try {
        fs.writeFileSync(filePath, content, "utf-8");
        return api.sendMessage(`✅ Đã cập nhật nội dung vào tệp ${fileName}.json.`, threadID, messageID);
      } catch (error) {
        console.error("Error writing file:", error);
        return api.sendMessage("❌ Lỗi khi cập nhật tệp.", threadID, messageID);
      }
    }

    // Handle delete command
    if (command === "delete" || command === "del") {
      const menuIndex = parseInt(args[1]);

      if (isNaN(menuIndex)) {
        return api.sendMessage("⚠️ Bạn cần cung cấp số thứ tự tệp để xóa.\nVí dụ: del 1", threadID, messageID);
      }

      // Get available files to map index to filename
      const availableFiles = fs.readdirSync(dir)
        .filter(file => file.endsWith(".json"))
        .map(file => path.basename(file, ".json"));

      if (availableFiles.length === 0) {
        return api.sendMessage("⚠️ Chưa có tệp nào được tạo.", threadID, messageID);
      }

      if (menuIndex < 1 || menuIndex > availableFiles.length) {
        return api.sendMessage(`⚠️ Số thứ tự không hợp lệ. Vui lòng chọn từ 1 đến ${availableFiles.length}.`, threadID, messageID);
      }

      const fileName = availableFiles[menuIndex - 1];
      const filePath = path.join(dir, `${fileName}.json`);

      try {
        fs.unlinkSync(filePath);
        return api.sendMessage(`✅ Đã xóa tệp "${fileName}.json".`, threadID, messageID);
      } catch (error) {
        console.error("Error deleting file:", error);
        return api.sendMessage("❌ Lỗi khi xóa tệp.", threadID, messageID);
      }
    }

    // Handle list command
    if (command === "list") {
      const files = fs.readdirSync(dir)
        .filter(file => file.endsWith(".json"))
        .map(file => path.basename(file, ".json"));

      if (files.length === 0) {
        return api.sendMessage("⚠️ Chưa có tệp nào được tạo.", threadID, messageID);
      }

      const fileList = files.map(file => `• Bảng giá ${file}`).join("\n");
      return api.sendMessage(`📋 Danh sách tệp hiện có:\n${fileList}`, threadID, messageID);
    }
  }

  // Original number/name selection logic
  const availableFiles = fs.readdirSync(dir)
    .filter(file => file.endsWith(".json"))
    .map(file => path.basename(file, ".json"));

  // Check if user input is a number (index)
  const inputNumber = parseInt(userInput);
  const guideNumber = availableFiles.length + 1;
  let selectedFile;

  // Check if user wants guide (handle empty files case)
  if ((userInput.toLowerCase() === "help") || 
      (availableFiles.length > 0 && inputNumber === guideNumber) || 
      (availableFiles.length === 0 && inputNumber === 1)) {
    const guideMsg = `📝 HƯỚNG DẪN SỬ DỤNG:\n\n• create [tên_tệp] - Tạo tệp mới\n• add [STT_MENU] [nội dung] - Thêm nội dung\n• del [STT_MENU] - Xóa tệp\n• list - Xem danh sách tệp\n\n💬 Reply ở SELL MENU để thực thi lệnh`;
    return api.sendMessage(guideMsg, threadID, messageID);
  }

  // Check if no files exist and user didn't ask for help
  if (availableFiles.length === 0) {
    return api.sendMessage("⚠️ Chưa có tệp nào được tạo. Reply '1' để xem hướng dẫn.", threadID, messageID);
  }

  if (!isNaN(inputNumber) && inputNumber >= 1 && inputNumber <= availableFiles.length) {
    // User selected by number
    selectedFile = availableFiles[inputNumber - 1];
  } else {
    // User selected by file name
    selectedFile = availableFiles.find(file => file === userInput);
  }

  if (!selectedFile) {
    const fileList = availableFiles.map((file, index) => `${index + 1}. ${file}`).join(", ");
    return api.sendMessage(`⚠️ Vui lòng chọn số hoặc tên tệp từ: ${fileList}, ${guideNumber}. Hướng dẫn\n\nHoặc sử dụng lệnh: create, add, delete, list`, threadID, messageID);
  }

  const filePath = path.join(dir, `${selectedFile}.json`);

  if (!fs.existsSync(filePath)) {
    return api.sendMessage("⚠️ Chưa tạo tệp này. Vui lòng yêu cầu tạo tệp trước.", threadID, messageID);
  }

  try {
    const content = fs.readFileSync(filePath, "utf-8").trim() || "📄 File rỗng.";
    return api.sendMessage(content, threadID, messageID);
  } catch (error) {
    console.error("Error reading file:", error);
    return api.sendMessage("❌ Lỗi khi đọc tệp.", threadID, messageID);
  }
};

module.exports.run = async function({ api, event, args }) {
  try {
    const { threadID, senderID } = event;
    const dir = ensureThreadFiles(threadID);

    // Check permissions for delay calculation
    const hasPermission = await checkPermissions(event, api);

    // Apply RandomDelay
    await RandomDelay.delay({
      commandType: 'normal',
      messageLength: 50, // Default length for sell command
      senderID: senderID,
      threadID: threadID,
      commandName: 'sell',
      hasPermission: hasPermission ? 2 : 0
    }, api);

    // Show menu directly
    const availableFiles = fs.readdirSync(dir)
      .filter(file => file.endsWith(".json"))
      .map(file => path.basename(file, ".json"));

    if (availableFiles.length === 0) {
      const msg = `📊 SELL MENU:\n━━━━━━━━━━━━━━━━━━━━\n\n⚠️ Chưa có bảng giá nào\n\n━━━━━━━━━━━━━━━━━━━━\n1. Help\n\n💬 Reply tin nhắn`;
      
      return api.sendMessage(msg, threadID, (err, info) => {
        if (!err && info) {
          global.client.handleReply.push({
            name: module.exports.config.name,
            messageID: info.messageID,
            author: event.senderID
          });
        }
      });
    }

    const menu = availableFiles.map((fileName, index) => `${index + 1}. ${fileName}`).join("\n");
    const guideNumber = availableFiles.length + 1;
    
    const msg = `📊 SELL MENU:\n━━━━━━━━━━━━━━━━━━━━\n\n${menu}\n\n━━━━━━━━━━━━━━━━━━━━\n${guideNumber}. Help\n\n💬 Reply tin nhắn`;

    return api.sendMessage(msg, threadID, (err, info) => {
      if (!err && info) {
        global.client.handleReply.push({
          name: module.exports.config.name,
          messageID: info.messageID,
          author: event.senderID
        });
      }
    });
  } catch (error) {
    console.error("Error in sell command:", error);
    return api.sendMessage("❌ Đã xảy ra lỗi khi thực hiện lệnh.", event.threadID);
  }
};