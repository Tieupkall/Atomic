
const RandomDelay = require("../utils/RandomDelay.js");

module.exports.config = {
  name: "randomdelay",
  version: "1.0.0",
  hasPermssion: 3,
  credits: "Atomic",
  description: "Quản lý random delay cho bot",
  commandCategory: "Admin",
  usages: "[on/off/config/stats]",
  cooldowns: 3
};

module.exports.run = async function({ api, event, args }) {
  const { threadID, messageID, senderID } = event;
  const subCommand = args[0]?.toLowerCase();

  if (!subCommand) {
    const stats = RandomDelay.getStats();
    return api.sendMessage(
      `╭─────────────────────────────────────⭓
├─ 🎭 RANDOM DELAY STATUS
├─ 📊 Trạng thái: ${stats.enabled ? '✅ Bật' : '❌ Tắt'}
├─ 👥 Users tracked: ${stats.totalUsers}
├─ 📱 Active threads: ${stats.activeThreads}
├─ ⚙️ Cách dùng:
├─   • ${global.config.PREFIX}randomdelay on/off
├─   • ${global.config.PREFIX}randomdelay stats
├─   • ${global.config.PREFIX}randomdelay config
╰─────────────────────────────────────⭓`,
      threadID,
      messageID
    );
  }

  switch (subCommand) {
    case "on":
    case "enable":
      RandomDelay.setEnabled(true);
      return api.sendMessage("✅ Đã bật Random Delay! Bot sẽ hoạt động tự nhiên hơn.", threadID, messageID);

    case "off":
    case "disable":
      RandomDelay.setEnabled(false);
      return api.sendMessage("❌ Đã tắt Random Delay! Bot sẽ phản hồi ngay lập tức.", threadID, messageID);

    case "stats":
    case "thongke":
      const stats = RandomDelay.getStats();
      const config = stats.config;
      
      return api.sendMessage(
        `╭─────────────────────────────────────⭓
├─ 📊 RANDOM DELAY STATISTICS
├─ 📈 Status: ${stats.enabled ? '🟢 Enabled' : '🔴 Disabled'}
├─ 👥 Users tracked: ${stats.totalUsers}
├─ 📱 Active threads: ${stats.activeThreads}
├─ ⏱️ Delay ranges:
├─   • Normal: ${config.delays.normal.min}-${config.delays.normal.max}ms
├─   • Admin: ${config.delays.admin.min}-${config.delays.admin.max}ms
├─   • Heavy: ${config.delays.heavy.min}-${config.delays.heavy.max}ms
├─   • AI: ${config.delays.ai.min}-${config.delays.ai.max}ms
├─   • Game: ${config.delays.game.min}-${config.delays.game.max}ms
├─ 🎭 Features:
├─   • Typing indicator: ${config.patterns.typing ? '✅' : '❌'}
├─   • Human errors: ${(config.patterns.humanErrors * 100).toFixed(1)}%
├─   • Activity tracking: ✅
╰─────────────────────────────────────⭓`,
        threadID,
        messageID
      );

    case "config":
    case "cauhinh":
      const currentConfig = RandomDelay.getStats().config;
      
      return api.sendMessage(
        `╭─────────────────────────────────────⭓
├─ ⚙️ RANDOM DELAY CONFIG
├─ 🎛️ Delays (ms):
├─   • normal: ${currentConfig.delays.normal.min}-${currentConfig.delays.normal.max}
├─   • admin: ${currentConfig.delays.admin.min}-${currentConfig.delays.admin.max}
├─   • heavy: ${currentConfig.delays.heavy.min}-${currentConfig.delays.heavy.max}
├─   • ai: ${currentConfig.delays.ai.min}-${currentConfig.delays.ai.max}
├─   • game: ${currentConfig.delays.game.min}-${currentConfig.delays.game.max}
├─ 📊 Factors:
├─   • Message length: ${currentConfig.factors.messageLength}
├─   • Thread activity: ${currentConfig.factors.threadActivity}
├─   • User history: ${currentConfig.factors.userHistory}
├─   • Time of day: ${currentConfig.factors.timeOfDay}
├─   • Command frequency: ${currentConfig.factors.commandFrequency}
├─ 🎭 Patterns:
├─   • Typing: ${currentConfig.patterns.typing ? 'Yes' : 'No'}
├─   • Human errors: ${(currentConfig.patterns.humanErrors * 100)}%
╰─────────────────────────────────────⭓

💡 Để chỉnh sửa, edit file: modules/utils/RandomDelay.js`,
        threadID,
        messageID
      );

    case "test":
      if (!RandomDelay.isEnabled()) {
        return api.sendMessage("❌ Random Delay đang tắt! Bật lên để test.", threadID, messageID);
      }
      
      const testOptions = {
        commandType: 'normal',
        messageLength: event.body.length,
        senderID,
        threadID,
        commandName: 'test',
        hasPermission: 2
      };
      
      const startTime = Date.now();
      await RandomDelay.delay(testOptions, api);
      const actualDelay = Date.now() - startTime;
      
      return api.sendMessage(
        `🧪 Test Random Delay completed!\n⏱️ Actual delay: ${actualDelay}ms\n🎭 Included typing simulation: ${RandomDelay.config.patterns.typing ? 'Yes' : 'No'}`,
        threadID,
        messageID
      );

    default:
      return api.sendMessage(
        `❌ Lệnh không hợp lệ!\n📖 Cách dùng: ${global.config.PREFIX}randomdelay [on/off/stats/config/test]`,
        threadID,
        messageID
      );
  }
};
