module.exports = function ({ api, models, Users, Threads, Currencies }) {
  const fs = require("fs");
  const path = require("path");
  const stringSimilarity = require("string-similarity");
  const logger = require("../../utils/log.js");
  const moment = require("moment-timezone");

  if (typeof global.client.getPrefix !== "function") {
    global.client.getPrefix = function getPrefix(threadID) {
      const cfg = global.config || {};
      const map = cfg.GROUP_PREFIX || {};
      const p = (threadID && map[threadID]) ? map[threadID] : cfg.PREFIX;
      return typeof p === "string" ? p : String(p || "!");
    };
  }

  const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  return async function ({ event }) {
    const dateNow = Date.now();
    const time = moment.tz("Asia/Ho_Chi_Minh").format("HH:mm:ss DD/MM/YYYY");
    const up = process.uptime();
    const hours = Math.floor(up / 3600);
    const minutes = Math.floor((up % 3600) / 60);
    const seconds = Math.floor(up % 60);

    const cfg = global.config;
    const { allowInbox, PREFIX, ADMINBOT, NDH, DeveloperMode } = cfg;
    const { userBanned, threadBanned, threadInfo, threadData, commandBanned } = global.data;
    const { commands } = global.client;

    let { body, senderID, threadID, messageID } = event;
    senderID = String(senderID);
    threadID = String(threadID);
    if (typeof body !== "string") body = "";

    let currentPrefix = (global.prefixTO && global.prefixTO[threadID]) || global.client.getPrefix(threadID);

    if (event.messageReply && body.trim() === "1") {
      if (!global.suggestedCommands) global.suggestedCommands = new Map();
      const sug = global.suggestedCommands.get(event.messageReply.messageID);
      if (sug) {
        body = currentPrefix + sug;
        global.suggestedCommands.delete(event.messageReply.messageID);
      } else return;
    }

    const prefixRegex = new RegExp(`^(<@!?${senderID}>|${escapeRegex(currentPrefix)})\\s*`);
    if (!prefixRegex.test(body)) return;

    const adminbot = require("../../config.json");
    const usgPath = path.join(__dirname, "usages.json");
    if (!fs.existsSync(usgPath)) fs.writeFileSync(usgPath, JSON.stringify({}));

    if (!global.data.allThreadID.includes(threadID) && !ADMINBOT.includes(senderID) && adminbot.adminPaseOnly === true)
      return api.sendMessage("Admin bot mới dùng bot trong đoạn chat riêng!!", threadID, messageID);
    if (!ADMINBOT.includes(senderID) && adminbot.adminOnly === true)
      return api.sendMessage("Admin bot mới sử dụng được!!", threadID, messageID);
    if (!NDH.includes(senderID) && !ADMINBOT.includes(senderID) && adminbot.ndhOnly === true)
      return api.sendMessage("NDH mới có thể sử dụng bot", threadID, messageID);

    const dataAdbox = require("../../modules/commands/cache/data.json");
    const inf = (threadInfo.get(threadID) || await Threads.getInfo(threadID));
    const isGroupAdmin = !!(inf.adminIDs && inf.adminIDs.find(e => e.id == senderID));
    if (dataAdbox.adminbox?.[threadID] === true && event.isGroup === true && !ADMINBOT.includes(senderID) && !NDH.includes(senderID) && !isGroupAdmin)
      return api.sendMessage("Quản trị viên mới sử dụng được!!", threadID, messageID);

    // qtvonly
    const configPath = path.join(__dirname, "../../config.json");
    let configData = {};
    try {
      if (fs.existsSync(configPath)) {
        delete require.cache[require.resolve(configPath)];
        configData = JSON.parse(fs.readFileSync(configPath, "utf8"));
      }
    } catch {}
    if (event.isGroup === true && configData.qtvonly?.[threadID]?.adminOnly === true) {
      const isAdminBot = ADMINBOT.includes(senderID);
      const isNDH = NDH.includes(senderID);
      if (!isAdminBot && !isNDH && !isGroupAdmin)
        return api.sendMessage("❌ Chỉ admin bot, NDH hoặc quản trị viên nhóm mới có thể sử dụng bot khi đang bật chế độ qtvonly!", threadID, messageID);
    }

    // ban từ file riêng
    const bannedFilePath = path.join(__dirname, "..", "..", "data", "banned_users.json");
    try {
      if (fs.existsSync(bannedFilePath)) {
        const customBannedUsers = JSON.parse(fs.readFileSync(bannedFilePath, "utf8"));
        if (customBannedUsers[senderID] && !ADMINBOT.includes(senderID) && !NDH.includes(senderID)) {
          const b = customBannedUsers[senderID];
          return api.sendMessage(
            `❌ Bạn đã bị cấm sử dụng bot!\n📝 Lý do: ${b.reason}\n⏰ Thời gian: ${b.dateAdded}`,
            threadID,
            async (err, info) => {
              await new Promise(r => setTimeout(r, 5000));
              return api.unsendMessage(info.messageID);
            },
            messageID
          );
        }
      }
    } catch {}

    if ((userBanned.has(senderID) || threadBanned.has(threadID) || (allowInbox === false && senderID === threadID)) &&
        !ADMINBOT.includes(senderID) && !NDH.includes(senderID)) {
      if (userBanned.has(senderID)) {
        const { reason, dateAdded } = userBanned.get(senderID) || {};
        return api.sendMessage(global.getText("handleCommand", "userBanned", reason, dateAdded), threadID, async (e, info) => {
          await new Promise(r => setTimeout(r, 5000));
          return api.unsendMessage(info.messageID);
        }, messageID);
      }
      if (threadBanned.has(threadID)) {
        const { reason, dateAdded } = threadBanned.get(threadID) || {};
        return api.sendMessage(global.getText("handleCommand", "threadBanned", reason, dateAdded), threadID, async (e, info) => {
          await new Promise(r => setTimeout(r, 5000));
          return api.unsendMessage(info.messageID);
        }, messageID);
      }
    }

    const [matchedPrefix] = body.match(prefixRegex);
    const parts = body.slice(matchedPrefix.length).trim().split(/ +/);
    const commandName = (parts.shift() || "").toLowerCase();
    const args = parts;
    let command = commands.get(commandName);

    if (!command) {
      const nowStr = moment.tz("Asia/Ho_Chi_Minh").format("DD/MM/YYYY - HH:mm:ss");
      if (!commandName) {
        return api.sendMessage({
          body: `[ 𝗔𝘁𝗼𝗺𝗶𝗰 ] 💡 Bạn chỉ gõ prefix!\n➡    Có phải bạn muốn xem menu?\n─────────────────────\n💬 Reply "1" để xem menu\n• Thời gian chạy: ${hours.toString().padStart(2,"0")}:${minutes.toString().padStart(2,"0")}:${seconds.toString().padStart(2,"0")}\n• Ngày giờ: ${nowStr}`,
          attachment: global.krystal ? global.krystal.splice(0, 1) : []
        }, threadID, (err, info) => {
          if (!err && info) {
            if (!global.suggestedCommands) global.suggestedCommands = new Map();
            global.suggestedCommands.set(info.messageID, "menu");
            setTimeout(() => global.suggestedCommands?.delete(info.messageID), 60000);
          }
        }, messageID);
      }

      const allNames = Array.from(global.client.commands.keys());
      const best = stringSimilarity.findBestMatch(commandName, allNames).bestMatch.target;
      return api.sendMessage({
        body: `[ 𝗔𝘁𝗼𝗺𝗶𝗰 ] ❌ Không có lệnh "${commandName}"\n➡    Có phải bạn muốn dùng: ${best}?\n─────────────────────\n💬 Reply "1" để chạy lệnh được gợi ý\n• Thời gian chạy: ${hours.toString().padStart(2,"0")}:${minutes.toString().padStart(2,"0")}:${seconds.toString().padStart(2,"0")}`,
        attachment: global.krystal ? global.krystal.splice(0, 1) : []
      }, threadID, (err, info) => {
        if (!err && info) {
          if (!global.suggestedCommands) global.suggestedCommands = new Map();
          global.suggestedCommands.set(info.messageID, best);
          setTimeout(() => global.suggestedCommands?.delete(info.messageID), 60000);
        }
      }, messageID);
    }

    if (!ADMINBOT.includes(senderID)) {
      const bansThread = commandBanned.get(threadID) || [];
      const bansUser = commandBanned.get(senderID) || [];
      if (bansThread.includes(command.config.name))
        return api.sendMessage(global.getText("handleCommand", "commandThreadBanned", command.config.name), threadID, async (e, info) => {
          await new Promise(r => setTimeout(r, 5000));
          return api.unsendMessage(info.messageID);
        }, messageID);
      if (bansUser.includes(command.config.name))
        return api.sendMessage(global.getText("handleCommand", "commandUserBanned", command.config.name), threadID, async (e, info) => {
          await new Promise(r => setTimeout(r, 5000));
          return api.unsendMessage(info.messageID);
        }, messageID);
    }

    if (command.config.commandCategory?.toLowerCase() === "nsfw" &&
        !global.data.threadAllowNSFW.includes(threadID) &&
        !ADMINBOT.includes(senderID)) {
      return api.sendMessage(global.getText("handleCommand", "threadNotAllowNSFW"), threadID, async (e, info) => {
        await new Promise(r => setTimeout(r, 5000));
        return api.unsendMessage(info.messageID);
      }, messageID);
    }

    let threadInfo2;
    if (event.isGroup === true) {
      try {
        threadInfo2 = (threadInfo.get(threadID) || await Threads.getInfo(threadID));
        if (!Object.keys(threadInfo2).length) throw new Error();
      } catch {
        logger(global.getText("handleCommand", "cantGetInfoThread", "error"));
      }
    }

    let perm = 0;
    const tInfo = (threadInfo.get(threadID) || await Threads.getInfo(threadID));
    const isAdmin = !!(tInfo.adminIDs && tInfo.adminIDs.find(e => e.id == senderID));
    if (ADMINBOT.includes(senderID)) perm = 3;
    else if (NDH.includes(senderID)) perm = 2;
    else if (!ADMINBOT.includes(senderID) && isAdmin) perm = 1;

    if (command.config.hasPermssion > perm) {
      const map = {1:"Quản Trị Viên",2:"ADMIN",3:"ADMIN"};
      return api.sendMessage(`Quyền hạn của lệnh: ${command.config.name} là ${map[command.config.hasPermssion] || "Không xác định"}`, threadID, messageID);
    }

    if (!global.client.cooldowns.has(command.config.name))
      global.client.cooldowns.set(command.config.name, new Map());
    const timestamps = global.client.cooldowns.get(command.config.name);
    const cooldown = (command.config.cooldowns || 1) * 1000;
    if (timestamps.has(senderID) && dateNow < timestamps.get(senderID) + cooldown) {
      const left = ((timestamps.get(senderID) + cooldown - dateNow) / 1000).toFixed(2);
      return api.sendMessage(`⏱ Bạn đang trong thời gian chờ!\n Vui lòng thử lại sau ${left}s nữa nhé!!!`, threadID, messageID);
    }

    let getText2 = () => {};
    if (command.languages && typeof command.languages === "object" && command.languages.hasOwnProperty(global.config.language)) {
      getText2 = (...vals) => {
        let lang = command.languages[global.config.language][vals[0]] || "";
        for (let i = vals.length; i >= 1; i--) lang = lang.replace(new RegExp("%"+i,"g"), vals[i]);
        return lang;
      };
    }

    try {
      const Obj = { api, event, args, models, Users, Threads, Currencies, permssion: perm, getText: getText2 };
      let usages;
      try { usages = JSON.parse(fs.readFileSync(usgPath)); } catch { usages = {}; }
      try { fs.writeFileSync(usgPath, JSON.stringify(usages, null, 4)); } catch {}

      if (typeof command.run !== "function") throw new Error(`Command ${commandName} không có run function hợp lệ`);
      global.currentExecutingCommand = commandName;
      command.run(Obj);
      timestamps.set(senderID, dateNow);

      if (DeveloperMode === true)
        logger(global.getText("handleCommand", "executeCommand", time, commandName, senderID, threadID, args.join(" "), (Date.now()) - dateNow), "MODE");
    } catch (e) {
      console.error(`Error executing command ${commandName}:`, e);
      return api.sendMessage(global.getText("handleCommand", "commandError", commandName, e.message || e), threadID);
    }
  };
};