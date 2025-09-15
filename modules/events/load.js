module.exports.config = {
  name: "load",
  eventType: ["message_reaction"],
  version: "1.0.4",
  credits: "atomic",
  description: "Auto reload khi reaction ✅, auto unsend khi reaction ❤️"
};

module.exports.run = async function({ api, event }) {
  try {
    const { messageID, reaction, userID, threadID } = event;
    if (reaction === "❤️" || reaction === "❤") {
      if (userID === api.getCurrentUserID()) return;
      try { await api.unsendMessage(messageID); } catch (e) { console.error(ts(), "[AutoUnsend]", e.stack || e); }
      return;
    }
    if (reaction === "✅") {
      if (userID === api.getCurrentUserID()) return;
      const adminBot = global.config.ADMINBOT || [];
      const isAdmin = adminBot.includes(userID) || adminBot.includes(String(userID));
      if (!isAdmin) return;
      try { await api.setMessageReaction("⏳", messageID); } catch {}
      try {
        const result = await autoReloadAll();
        if (result.totalFailed > 0) {
          const head = `🔄 AUTO RELOAD RESULT\n━━━━━━━━━━━━━━━\n✅ Thành công: ${result.totalLoaded}\n❌ Thất bại: ${result.totalFailed}\n\n🚫 Chi tiết lỗi:\n`;
          const briefList = result.allErrors.slice(0, 8).join("\n");
          const more = result.allErrors.length > 8 ? `\n📋 Và ${result.allErrors.length - 8} lỗi khác...` : "";
          const tip = `\n\n💡 Tip: Kiểm tra syntax, dependencies và cấu trúc module`;
          try { await api.setMessageReaction("⚠️", messageID); } catch {}
          const sent = await api.sendMessage(head + briefList + more + tip, threadID);
          setTimeout(() => api.unsendMessage(sent.messageID), 7000);
          logDetailedErrors(result);
        } else {
          try { await api.setMessageReaction("✅", messageID); } catch {}
        }
      } catch (loadError) {
        try { await api.setMessageReaction("❌", messageID); } catch {}
        const sent = await api.sendMessage(
          `❌ LỖI AUTO RELOAD:\n${loadError.name}: ${loadError.message}`,
          threadID
        );
        setTimeout(() => api.unsendMessage(sent.messageID), 7000);
        console.error(ts(), "[AutoReload:Fatal]", loadError.stack || loadError);
      }
    }
  } catch (e) {
    console.error(ts(), "[EventError]", e.stack || e);
  }
};

function ts() {
  return new Date().toISOString().replace("T", " ").replace("Z", "");
}

function logDetailedErrors(result) {
  const sections = [
    ["COMMAND", result.cmdResult?.failedList],
    ["EVENT", result.evtResult?.failedList],
    ["UTIL", result.utilResult?.failedList],
    ["LISTEN", result.listenResult?.failedList],
    ["HANDLER", result.handlersResult?.failedList]
  ];
  console.error(ts(), "[AutoReload:Summary]", "Loaded:", result.totalLoaded, "Failed:", result.totalFailed);
  for (const [label, list] of sections) {
    if (Array.isArray(list) && list.length) {
      console.error(ts(), `[AutoReload:${label}] ${list.length} lỗi:`);
      for (const item of list) console.error(" •", item);
    }
  }
}

async function autoReloadAll() {
  let totalLoaded = 0, totalFailed = 0, allErrors = [];
  const results = {};
  for (const [name, fn] of [
    ["cmdResult", reloadCommands],
    ["evtResult", reloadEvents],
    ["utilResult", reloadUtils],
    ["listenResult", reloadListen],
    ["handlersResult", reloadHandlers]
  ]) {
    const r = await fn();
    results[name] = r;
    totalLoaded += r.loaded; totalFailed += r.failed;
    if (r.failedList.length) allErrors.push(...r.failedList);
  }
  return { totalLoaded, totalFailed, allErrors, ...results };
}

async function reloadCommands() {
  const fs = require("fs"), path = require("path");
  const dir = path.join(__dirname, "..", "commands");
  if (!fs.existsSync(dir)) return { loaded: 0, failed: 1, failedList: ["Commands dir not found"] };
  const files = fs.readdirSync(dir).filter(f => f.endsWith(".js") && f !== "load.js");
  if (!global.client.commands) global.client.commands = new Map();
  let loaded = 0, failed = 0, failedList = [];
  for (const file of files) {
    const full = path.join(dir, file);
    try {
      const res = require.resolve(full); if (require.cache[res]) delete require.cache[res];
      const mod = require(full);
      if (!mod.config || typeof mod.run !== "function" || !mod.config.name) {
        failed++; failedList.push(`⚙️ ${file} (thiếu config/run)`); continue;
      }
      global.client.commands.set(mod.config.name, { ...mod, path: full, fileName: file });
      if (typeof mod.onLoad === "function") {
        try { await mod.onLoad({ api: global.client.api, models: global.models }); }
        catch (e) { console.error(ts(), `[onLoad:commands/${file}]`, e.stack || e); }
      }
      loaded++;
    } catch (err) {
      failed++; failedList.push(`⚙️ ${file}: ${shortErr(err)}`); console.error(ts(), "[ReloadCommandError]", err.stack || err);
    }
  }
  return { loaded, failed, failedList };
}

async function reloadEvents() {
  const fs = require("fs"), path = require("path");
  const dir = __dirname;
  if (!fs.existsSync(dir)) return { loaded: 0, failed: 1, failedList: ["Events dir not found"] };
  const files = fs.readdirSync(dir).filter(f => f.endsWith(".js") && f !== "load.js");
  if (!global.client.events) global.client.events = new Map();
  let loaded = 0, failed = 0, failedList = [];
  for (const file of files) {
    const full = path.join(dir, file);
    try {
      const res = require.resolve(full); if (require.cache[res]) delete require.cache[res];
      const mod = require(full);
      if (!mod.config || (!mod.run && !mod.handleEvent)) {
        failed++; failedList.push(`🎯 ${file} (thiếu config/run)`); continue;
      }
      global.client.events.set(mod.config.name || file, { ...mod, path: full, fileName: file });
      loaded++;
    } catch (err) {
      failed++; failedList.push(`🎯 ${file}: ${shortErr(err)}`); console.error(ts(), "[ReloadEventError]", err.stack || err);
    }
  }
  return { loaded, failed, failedList };
}

async function reloadUtils() {
  const fs = require("fs"), path = require("path");
  const dir = path.join(__dirname, "..", "utils");
  if (!fs.existsSync(dir)) return { loaded: 0, failed: 0, failedList: [] };
  const files = fs.readdirSync(dir).filter(f => f.endsWith(".js"));
  if (!global.client.utils) global.client.utils = new Map();
  let loaded = 0, failed = 0, failedList = [];
  for (const file of files) {
    const full = path.join(dir, file);
    try {
      const res = require.resolve(full); if (require.cache[res]) delete require.cache[res];
      const mod = require(full);
      global.client.utils.set(file.replace(".js", ""), { ...mod, path: full, fileName: file });
      loaded++;
    } catch (err) {
      failed++; failedList.push(`🛠 ${file}: ${shortErr(err)}`); console.error(ts(), "[ReloadUtilError]", err.stack || err);
    }
  }
  return { loaded, failed, failedList };
}

async function reloadListen() {
  const path = require("path");
  let loaded = 0, failed = 0, failedList = [];
  try {
    const p = path.join(__dirname, "../../includes/listen.js");
    const res = require.resolve(p); if (require.cache[res]) delete require.cache[res];
    const mod = require(p);
    if (typeof mod === "function") { loaded++; } else { failed++; failedList.push("🎧 listen.js (không phải function)"); }
  } catch (err) {
    failed++; failedList.push(`🎧 listen.js: ${shortErr(err)}`); console.error(ts(), "[ReloadListenError]", err.stack || err);
  }
  return { loaded, failed, failedList };
}

async function reloadHandlers() {
  const fs = require("fs"), path = require("path");
  const dir = path.join(__dirname, "../../includes/handle");
  if (!fs.existsSync(dir)) return { loaded: 0, failed: 0, failedList: [] };
  const files = fs.readdirSync(dir).filter(f => f.endsWith(".js"));
  let loaded = 0, failed = 0, failedList = [];
  for (const file of files) {
    const full = path.join(dir, file);
    try {
      const res = require.resolve(full); if (require.cache[res]) delete require.cache[res];
      require(full); loaded++;
    } catch (err) {
      failed++; failedList.push(`🔧 ${file}: ${shortErr(err)}`); console.error(ts(), "[ReloadHandlerError]", err.stack || err);
    }
  }
  return { loaded, failed, failedList };
}

function shortErr(err) {
  const m = (err && err.message) ? err.message : String(err);
  return m.length > 100 ? m.slice(0, 100) + "..." : m;
}