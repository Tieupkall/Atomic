module.exports.config = {
  name: "autocmd",
  eventType: ["message_reply"],
  version: "1.0.2",
  credits: "atomic",
  description: "Tự động thực thi lệnh khi reply tin nhắn chứa tên lệnh"
};

const fs = require("fs");
const path = require("path");

const escapeRegex = s => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const resolvePrefix = tID => {
  const cfg = global.config || {};
  const m = cfg.GROUP_PREFIX || {};
  return (m && typeof m[tID] === "string" && m[tID]) || (typeof cfg.PREFIX === "string" && cfg.PREFIX) || "/";
};

function isBotOn() {
  try {
    const p = path.join(process.cwd(), "data", "bot.json");
    if (fs.existsSync(p)) {
      const j = JSON.parse(fs.readFileSync(p, "utf8"));
      if (j && j.enabled === false) return false;
    }
  } catch {}
  if (typeof global.botEnabled !== "undefined" && global.botEnabled === false) return false;
  return true;
}

module.exports.run = async function ({ api, event, Users, Threads, Currencies, models }) {
  try {
    if (!isBotOn()) return;
    const cmds = global.client && global.client.commands;
    if (!cmds || cmds.size === 0) return;

    const aiCmdPresent = !!(cmds.get("ai") || cmds.get("gpt") || cmds.get("ask"));
    if (!aiCmdPresent) return;

    if (event.type !== "message_reply") return;

    const { body, threadID, senderID, messageID, messageReply } = event;
    if (!body || typeof body !== "string") return;
    if (senderID === api.getCurrentUserID()) return;
    if (!messageReply || messageReply.senderID !== api.getCurrentUserID()) return;

    const lowerBody = body.toLowerCase().trim();
    const prefix = resolvePrefix(threadID);
    if (lowerBody.startsWith(prefix)) return;

    let foundCommand = null, commandArgs = [], detectedCommandName = "";
    for (const [name, data] of cmds.entries()) {
      const n = name.toLowerCase();
      if (lowerBody === n || lowerBody.startsWith(n + " ")) {
        foundCommand = data; detectedCommandName = name;
        const argsText = body.slice(name.length).trim();
        commandArgs = argsText ? argsText.split(" ") : [];
        break;
      }
    }

    if (!foundCommand) {
      for (const [name, data] of cmds.entries()) {
        const n = name.toLowerCase();
        const wordBoundary = new RegExp(`\\b${escapeRegex(n)}\\b`, "i");
        if (wordBoundary.test(body)) {
          foundCommand = data; detectedCommandName = name;
          const match = body.match(new RegExp(`\\b${escapeRegex(n)}\\b\\s*(.*)`, "i"));
          const argsText = match && match[1] ? match[1].trim() : "";
          commandArgs = argsText ? argsText.split(" ") : [];
          break;
        }
      }
    }

    if (foundCommand && commandArgs.length > 0 && foundCommand.config && foundCommand.config.subcommands) {
      const sub = commandArgs[0].toLowerCase();
      const subs = foundCommand.config.subcommands;
      if (subs[sub]) {
        foundCommand = subs[sub];
        detectedCommandName = `${detectedCommandName}.${sub}`;
        commandArgs = commandArgs.slice(1);
      }
    }

    if (lowerBody === "check" || lowerBody === "/check") {
      const c = cmds.get("check");
      if (c) { foundCommand = c; detectedCommandName = "check"; commandArgs = ["all"]; }
    }

    const checkPatterns = [
      /^(mở|xem|hiển thị|show)\s*(check|thống kê|tương tác)\s*(đi|nào|thôi|đây)?$/i,
      /^check\s*(đi|nào|thôi|đây|xem|nhanh)$/i,
      /^(xem|mở)\s*(tương tác|thống kê)\s*(đi|nào|thôi)?$/i,
      /^(check|xem)\s*(tương tác|thống kê)\s*(nhóm|group)\s*(đi|nào|thôi)?$/i,
      /^(cho|để)\s*(mình|tôi|em)\s*(xem|check)\s*(tương tác|thống kê)\s*(đi|nào|thôi)?$/i,
      /^(tương tác|thống kê)\s*(đi|nào|thôi|đây)$/i
    ];
    if (!foundCommand) {
      for (const p of checkPatterns) {
        if (p.test(lowerBody)) {
          const c = cmds.get("check");
          if (c) { foundCommand = c; detectedCommandName = "check"; commandArgs = ["all"]; }
          break;
        }
      }
    }

    if (lowerBody === "upbot" || lowerBody === "/upbot") {
      const u = cmds.get("upbot");
      if (u) { foundCommand = u; detectedCommandName = "upbot"; commandArgs = ["sync"]; }
    }

    if (!foundCommand) return;

    const dangerous = ["kick", "out", "outall", "canhbao", "ai", "cmd", "rs", "add", "run", "adc"];
    if (dangerous.includes(detectedCommandName.toLowerCase())) return;

    const cfg = global.config || {};
    const admins = Array.isArray(cfg.ADMINBOT) ? cfg.ADMINBOT : [];
    const ndh = Array.isArray(cfg.NDH) ? cfg.NDH : [];
    const role = admins.includes(senderID) ? 2 : (ndh.includes(senderID) ? 1 : 0);
    if ((foundCommand.config && foundCommand.config.hasPermssion || 0) > role) return;

    const cooldowns = global.client.cooldowns || new Map();
    global.client.cooldowns = cooldowns;
    const now = Date.now();
    const cdMs = (foundCommand.config && foundCommand.config.cooldowns || 3) * 1000;
    const key = foundCommand.config && foundCommand.config.name || detectedCommandName;
    if (!cooldowns.has(key)) cooldowns.set(key, new Map());
    const stamps = cooldowns.get(key);

    if (stamps.has(senderID)) {
      const exp = stamps.get(senderID) + cdMs;
      if (now < exp) return;
    }

    stamps.set(senderID, now);
    setTimeout(() => stamps.delete(senderID), cdMs);

    const getText = (foundCommand.languages && typeof foundCommand.languages === "object")
      ? (...v) => {
          const langPack = foundCommand.languages || {};
          if (!Object.prototype.hasOwnProperty.call(langPack, cfg.language)) return `Không tìm thấy ngôn ngữ ${cfg.language} cho lệnh ${foundCommand.config.name}`;
          let s = foundCommand.languages[cfg.language][v[0]] || "";
          for (let i = v.length - 1; i > 0; i--) s = s.replace(new RegExp("%" + i, "g"), v[i]);
          return s;
        }
      : () => {};

    await new Promise(r => setTimeout(r, 3000));

    try {
      if (foundCommand.config && foundCommand.config.name === "load") {
        await foundCommand.run({
          api,
          event: { ...event, args: commandArgs, body: commandArgs.join(" "), messageID },
          args: commandArgs, Users, Threads, Currencies, models, getText
        });
      } else {
        await foundCommand.run({
          api,
          event: { ...event, args: commandArgs, body: commandArgs.join(" "), messageID: undefined },
          args: commandArgs, Users, Threads, Currencies, models, getText
        });
      }
    } catch {}
  } catch {}
};