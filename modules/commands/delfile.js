const fs = require('fs');
const path = require('path');

module.exports.config = {
  name: "delfile",
  version: "1.3",
  hasPermission: 3,
  credits: "Atomic",
  description: "Liệt kê và xoá nhanh các file trong commands, tự thu hồi tin nhắn sau 30 giây",
  commandCategory: "Admin",
  usages: "[số hoặc khoảng số] hoặc giữ [số] để giữ lại và xoá phần còn lại",
  cooldowns: 5
};

module.exports.handleReply = async ({ api, event, handleReply }) => {
  const { files, commandsPath } = handleReply;
  const userInput = event.body.trim();

  if (userInput.toLowerCase() === 'hủy' || userInput.toLowerCase() === 'cancel') {
    return api.sendMessage("❌ Đã hủy thao tác xóa file.", event.threadID, (err, info) => {
      if (!err) setTimeout(() => api.unsendMessage(info.messageID), 30000);
    }, event.messageID);
  }

  const isKeepMode = userInput.toLowerCase().startsWith("giữ ") || userInput.toLowerCase().startsWith("keep ");
  let userArgs = userInput;

  if (isKeepMode) {
    userArgs = userInput.replace(/^giữ\s+|^keep\s+/i, '');
  }

  try {
    let selectedIndexes = new Set();
    const args = userArgs.split(/\s+/);

    for (const arg of args) {
      if (/^\d+$/.test(arg)) {
        const index = parseInt(arg) - 1;
        if (index >= 0 && index < files.length) {
          selectedIndexes.add(index);
        }
      } else if (/^\d+-\d+$/.test(arg)) {
        const [start, end] = arg.split('-').map(n => parseInt(n) - 1);
        if (start <= end && start >= 0 && end < files.length) {
          for (let i = start; i <= end; i++) {
            selectedIndexes.add(i);
          }
        }
      }
    }

    if (selectedIndexes.size === 0) {
      return api.sendMessage("❌ Không có số nào hợp lệ để xử lý.", event.threadID, (err, info) => {
        if (!err) setTimeout(() => api.unsendMessage(info.messageID), 30000);
      }, event.messageID);
    }

    const indexesToDelete = isKeepMode
      ? files.map((_, i) => i).filter(i => !selectedIndexes.has(i))
      : [...selectedIndexes];

    let deleted = [], failed = [];

    for (const index of indexesToDelete) {
      const filePath = path.join(commandsPath, files[index]);
      try {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
          deleted.push(files[index]);
        } else {
          failed.push(files[index] + " (file not found)");
        }
      } catch (error) {
        failed.push(files[index] + ` (${error.code || 'unknown error'})`);
      }
    }

    let msg = "";
    if (deleted.length > 0) {
      msg += `✅ Đã xóa ${deleted.length} file:\n${deleted.map(f => "- " + f).join("\n")}\n`;
    }
    if (failed.length > 0) {
      msg += `❌ Lỗi khi xóa ${failed.length} file:\n${failed.map(f => "- " + f).join("\n")}`;
    }

    return api.sendMessage(msg.trim(), event.threadID, (err, info) => {
      if (!err) setTimeout(() => api.unsendMessage(info.messageID), 30000);
    }, event.messageID);
  } catch (error) {
    console.error("Error in xoafile handleReply:", error);
    return api.sendMessage("❌ Đã xảy ra lỗi khi thực hiện thao tác.", event.threadID, (err, info) => {
      if (!err) setTimeout(() => api.unsendMessage(info.messageID), 30000);
    }, event.messageID);
  }
};

module.exports.run = async ({ api, event, args }) => {
  try {
    const commandsPath = __dirname;

    if (!fs.existsSync(commandsPath)) {
      return api.sendMessage("❌ Thư mục commands không tồn tại.", event.threadID, (err, info) => {
        if (!err) setTimeout(() => api.unsendMessage(info.messageID), 30000);
      }, event.messageID);
    }

    const files = fs.readdirSync(commandsPath).filter(f => f.endsWith('.js') && f !== path.basename(__filename));

    if (files.length === 0) {
      return api.sendMessage("⚠️ Không có file nào để xóa trong thư mục `commands/`.", event.threadID, (err, info) => {
        if (!err) setTimeout(() => api.unsendMessage(info.messageID), 30000);
      }, event.messageID);
    }

    if (args[0]) {
      let indexesToDelete = new Set();

      for (const arg of args) {
        if (/^\d+$/.test(arg)) {
          const index = parseInt(arg) - 1;
          if (index >= 0 && index < files.length) {
            indexesToDelete.add(index);
          }
        } else if (/^\d+-\d+$/.test(arg)) {
          const [start, end] = arg.split('-').map(n => parseInt(n) - 1);
          if (start <= end && start >= 0 && end < files.length) {
            for (let i = start; i <= end; i++) {
              indexesToDelete.add(i);
            }
          }
        }
      }

      const validIndexes = [...indexesToDelete];

      if (validIndexes.length === 0) {
        return api.sendMessage("❌ Không có số nào hợp lệ để xóa.", event.threadID, (err, info) => {
          if (!err) setTimeout(() => api.unsendMessage(info.messageID), 30000);
        }, event.messageID);
      }

      let deleted = [], failed = [];

      for (const index of validIndexes) {
        const filePath = path.join(commandsPath, files[index]);
        try {
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            deleted.push(files[index]);
          } else {
            failed.push(files[index] + " (file not found)");
          }
        } catch (error) {
          failed.push(files[index] + ` (${error.code || 'unknown error'})`);
        }
      }

      let msg = "";
      if (deleted.length > 0) {
        msg += `✅ Đã xóa ${deleted.length} file:\n${deleted.map(f => "- " + f).join("\n")}\n`;
      }
      if (failed.length > 0) {
        msg += `❌ Lỗi khi xóa ${failed.length} file:\n${failed.map(f => "- " + f).join("\n")}`;
      }

      return api.sendMessage(msg.trim(), event.threadID, (err, info) => {
        if (!err) setTimeout(() => api.unsendMessage(info.messageID), 30000);
      }, event.messageID);
    }

    // Gửi danh sách file và chờ người dùng reply
    let msg = "📂 Danh sách file trong `commands/`:\n";
    files.forEach((f, i) => msg += `${i + 1}. ${f}\n`);
    msg += "\n🗑 Reply tin nhắn này với số để xóa: `1`, `1-3`, hoặc `1 4 6`";
    msg += "\n💡 Hoặc reply `giữ 1 2 3` để chỉ giữ lại và xóa các file còn lại.";
    msg += "\nReply `hủy` để hủy thao tác.";

    return api.sendMessage(msg, event.threadID, (error, info) => {
      if (!error) {
        global.client.handleReply.push({
          name: module.exports.config.name,
          messageID: info.messageID,
          author: event.senderID,
          files: files,
          commandsPath: commandsPath
        });

        // Tự thu hồi tin nhắn sau 2 phút
        setTimeout(() => {
          api.unsendMessage(info.messageID);
        }, 180000);
      }
    });

  } catch (error) {
    console.error("Error in xoafile run:", error);
    return api.sendMessage("❌ Đã xảy ra lỗi khi thực hiện lệnh.", event.threadID, (err, info) => {
      if (!err) setTimeout(() => api.unsendMessage(info.messageID), 30000);
    }, event.messageID);
  }
};
