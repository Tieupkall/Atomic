module.exports.config = {
  name: "camlenh",
  version: "1.0.5",
  hasPermssion: 2,
  credits: "Mirai team", //fix Atomic
  description: "Cấm lệnh ",
  commandCategory: "Admin",
  usages: "add < lệnh cần cấm >, del < lệnh cần gỡ >, add silent < lệnh cần cấm >, del silent < lệnh cần gỡ > / có thể cấm all lệnh bằng cách add all / gỡ cấm all lệnh thì del all",
  cooldowns: 5,
  dependencies: {
    "moment-timezone": ""
  }
};

module.exports.languages = {
  "vi": {
    "allCommand": "toàn bộ lệnh",
    "commandList": "những lệnh",
    "banCommandSuccess": "✅ Yêu cầu cấm lệnh đã được xử lý thành công",
    "unbanCommandSuccess": "✅ Yêu cầu gỡ cấm %1 đã được xử lý thành công.",
    "missingCommandInput": "❌ %1 Vui lòng nhập lệnh cần cấm sử dụng trong nhóm !",
    "notExistBanCommand": "❌ Nhóm của bạn chưa từng bị cấm sử dụng lệnh",
    "IDNotFound": "❌ %1 Không tìm thấy ID nhóm",
    "errorReponse": "❌ %1 Đã xảy ra lỗi không mong muốn",
    "returnBanCommand": "🔄 Bạn vừa yêu cầu cấm lệnh trên nhóm này\n- Các lệnh cần cấm: %2\n\n Thả cảm xúc để xác nhận",
    "returnUnbanCommand": "🔄 Bạn vừa yêu cầu gỡ cấm lệnh trên nhóm này\n- Các lệnh cần gỡ cấm: %2\n\n< Thả cảm xúc để xác nhận>",
    "usage": "📋 Hướng dẫn sử dụng lệnh camlenh:\n\n• camlenh add <tên lệnh> - Cấm lệnh\n• camlenh del <tên lệnh> - Gỡ cấm lệnh\n• camlenh add silent <tên lệnh> - Cấm lệnh (không thông báo)\n• camlenh del silent <tên lệnh> - Gỡ cấm lệnh (không thông báo)\n• camlenh add all - Cấm tất cả lệnh\n• camlenh del all - Gỡ cấm tất cả lệnh"
  }
};

module.exports.handleReaction = async ({ event, api, Threads, handleReaction, getText }) => {
  if (parseInt(event.userID) !== parseInt(handleReaction.author)) return;
  const moment = require("moment-timezone");
  const { threadID } = event;
  const { messageID, type, targetID, reason, commandNeedBan, isSilent } = handleReaction;

  const time = moment.tz("Asia/Ho_Chi_minh").format("HH:MM:ss L");
  global.client.handleReaction.splice(global.client.handleReaction.findIndex(item => item.messageID == messageID), 1);

  switch (type) {
    case "banCommand": {
      try {
        let data = (await Threads.getData(targetID)).data || {};
        data.commandBanned = [...data.commandBanned || [], ...commandNeedBan];
        if (isSilent) {
          data.silentBanned = [...data.silentBanned || [], ...commandNeedBan];
        }
        await Threads.setData(targetID, { data });
        global.data.commandBanned.set(targetID, data.commandBanned);
        if (isSilent && data.silentBanned) {
          global.data.silentBanned = global.data.silentBanned || new Map();
          global.data.silentBanned.set(targetID, data.silentBanned);
        }
        return api.sendMessage(getText("banCommandSuccess", targetID), threadID);
      } catch (e) {
        return api.sendMessage(getText("errorReponse", "[ THÔNG BÁO ]", targetID), threadID);
      }
    }
    case "unbanCommand": {
      try {
        let data = (await Threads.getData(targetID)).data || {};
        data.commandBanned = [...data.commandBanned.filter(item => !commandNeedBan.includes(item))];
        if (isSilent && data.silentBanned) {
          data.silentBanned = [...data.silentBanned.filter(item => !commandNeedBan.includes(item))];
        }
        await Threads.setData(targetID, { data });
        global.data.commandBanned.set(targetID, data.commandBanned);
        if (isSilent && data.silentBanned) {
          global.data.silentBanned = global.data.silentBanned || new Map();
          global.data.silentBanned.set(targetID, data.silentBanned);
          if (data.silentBanned.length == 0) global.data.silentBanned.delete(targetID);
        }
        if (data.commandBanned.length == 0) global.data.commandBanned.delete(targetID);
        return api.sendMessage(getText("unbanCommandSuccess", ((data.commandBanned.length == 0) ? getText("allCommand") : `${getText("commandList")}: ${commandNeedBan.join(", ")}`), targetID), threadID);
      } catch (e) {
        return api.sendMessage(getText("errorReponse", "[ THÔNG BÁO ]", targetID), threadID);
      }
    }
    default:
      break;
  }
};

module.exports.run = async ({ event, api, args, Threads, getText }) => {
  const { threadID, messageID } = event;

  if (!args || args.length === 0) {
    return api.sendMessage(getText("usage"), threadID, messageID);
  }

  var targetID = String(args[1]);
  var reason = (args.slice(2, args.length)).join(" ") || null;
  var isSilent = false;

  if (args[1] === "silent") {
    isSilent = true;
    targetID = String(args[2]);
    reason = (args.slice(3, args.length)).join(" ") || null;

    if (isNaN(targetID)) {
      targetID = String(event.threadID);
      reason = (args.slice(2, args.length)).join(" ") || null;
    }
  } else if (isNaN(targetID)) {
    if (args[1] === "silent") {
      isSilent = true;
      targetID = String(event.threadID);
      reason = (args.slice(2, args.length)).join(" ") || null;
    } else {
      targetID = String(event.threadID);
      reason = (args.slice(1, args.length)).join(" ") || null;
    }
  }

  switch (args[0]) {
    case "lệnh":
    case "add": {
      if (!global.data.allThreadID.includes(targetID)) return api.sendMessage(getText("IDNotFound", "[ THÔNG BÁO ]"), threadID, messageID);
      if (reason == null || reason.length == 0) return api.sendMessage(getText("missingCommandInput", '[ THÔNG BÁO ]'), threadID, messageID);
      if (reason == "all") {
        var allCommandName = [];
        const commandValues = global.client.commands.keys();
        for (const cmd of commandValues) allCommandName.push(cmd);
        reason = allCommandName.join(" ");
      }
      const commandNeedBan = reason.split(" ");
      return api.sendMessage(getText("returnBanCommand", targetID, ((commandNeedBan.length == global.client.commands.size) ? getText("allCommand") : commandNeedBan.join(", "))), threadID, (error, info) => {
        global.client.handleReaction.push({
          type: "banCommand",
          targetID,
          commandNeedBan,
          isSilent,
          name: this.config.name,
          messageID: info.messageID,
          author: event.senderID,
        });
      }, messageID);
    }

    case "unban":
    case "del": {
      if (!global.data.allThreadID.includes(targetID)) return api.sendMessage(getText("IDNotFound", "[ THÔNG BÁO ]"), threadID, messageID);
      if (!global.data.commandBanned.has(targetID)) return api.sendMessage(getText("notExistBanCommand"), threadID, messageID);
      if (reason == null || reason.length == 0) return api.sendMessage(getText("missingCommandInput", "[ THÔNG BÁO ]"), threadID, messageID);
      if (reason == "all") {
        reason = (global.data.commandBanned.get(targetID)).join(" ");
      }
      const commandNeedBan = reason.split(" ");
      return api.sendMessage(getText("returnUnbanCommand", targetID, ((commandNeedBan.length == global.data.commandBanned.get(targetID).length) ? "toàn bộ lệnh" : commandNeedBan.join(", "))), threadID, (error, info) => {
        global.client.handleReaction.push({
          type: "unbanCommand",
          targetID,
          commandNeedBan,
          isSilent,
          name: this.config.name,
          messageID: info.messageID,
          author: event.senderID,
        });
      }, messageID);
    }

    default: {
      return api.sendMessage(getText("usage"), threadID, messageID);
    }
  }
};