
const moment = require("moment-timezone");
const chalk = require("chalk");

const WIDTH = 40; // Độ rộng khung

// Hàm vẽ đường kẻ trên
const printLine = () => {
  console.log(chalk.cyan.bold("┌" + "─".repeat(WIDTH - 2) + "┐"));
};

// Hàm vẽ đường kẻ dưới
const printEnd = () => {
  console.log(chalk.cyan.bold("└" + "─".repeat(WIDTH - 2) + "┘"));
};

// Hàm căn chỉnh nội dung trong khung
const padLine = (content) => {
  const cleanContent = content.replace(/\u001b\[[0-9;]*m/g, ''); // Xóa mã màu để tính độ dài chính xác
  const padding = WIDTH - 4 - cleanContent.length;
  return chalk.cyan.bold("│ ") + chalk.bold(content) + " ".repeat(Math.max(0, padding)) + chalk.cyan.bold(" │");
};

module.exports.config = {
  name: "console",
  eventType: ["message", "message_reply"],
  version: "1.0.3",
  credits: "Atomic",
  description: "Hiển thị tin nhắn ra console gọn, có màu và hiển thị Sender ID"
};

module.exports.run = async function({ api, event, Users, Threads }) {
  const { threadID, senderID, body } = event;

  if (senderID === api.getCurrentUserID()) return;
  if (!body) return;

  // Kiểm tra xem console có được bật không
  try {
    const consoleMgr = require('../commands/console.js');
    const consoleConfig = consoleMgr.getConsoleConfig();
    if (!consoleConfig.enabled) {
      return; // Không hiển thị nếu console bị tắt
    }
  } catch (error) {
    // Nếu không tìm thấy console hoặc có lỗi, mặc định hiển thị
  }

  try {
    const senderName = await Users.getNameUser(senderID) || "Unknown User";

    let threadInfo;
    try {
      threadInfo = await Threads.getInfo(threadID);
    } catch (err) {
      threadInfo = { threadName: `Thread ${threadID}` };
    }

    const threadName = threadInfo.threadName || `Thread ${threadID}`;
    const timeVN = moment.tz("Asia/Ho_Chi_Minh").format("HH:mm:ss DD/MM/YYYY");

    // Hàm chia text thành nhiều dòng
    const splitText = (content, maxWidth) => {
      if (content.length <= maxWidth) {
        return [content];
      }
      
      const lines = [];
      for (let i = 0; i < content.length; i += maxWidth) {
        lines.push(content.slice(i, i + maxWidth));
      }
      return lines;
    };

    // In khung
    printLine();
    console.log(padLine(chalk.yellow.bold("💬 TIN NHẮN MỚI")));
    console.log(chalk.cyan.bold("├" + "─".repeat(WIDTH - 2) + "┤"));
    console.log(padLine("👤 Tên: " + chalk.blue.bold(senderName)));
    console.log(padLine("🆔 ID: " + chalk.gray.bold(senderID)));
    console.log(padLine("💭 Nhóm: " + chalk.magenta.bold(threadName)));
    console.log(padLine("🕐 " + chalk.green.bold(timeVN)));
    console.log(padLine("📱 Thread ID: " + chalk.gray.bold(threadID)));
    console.log(chalk.cyan.bold("├" + "─".repeat(WIDTH - 2) + "┤"));

    // In nội dung tin nhắn: chỉ dòng đầu có biểu tượng 💬
    const messageLines = splitText(body, WIDTH - 8);
    messageLines.forEach((line, index) => {
      const prefix = index === 0 ? "💬 " : "   ";
      console.log(padLine(prefix + chalk.white.bold(line)));
    });
    printEnd();

  } catch (error) {
    console.error(chalk.red(`❌ [Console] Lỗi xử lý: ${error.message}`));
  }
};
