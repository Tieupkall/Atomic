const { execSync } = require("child_process");

function ensurePackage(pkg) {
  try { require.resolve(pkg); }
  catch { execSync(`npm install ${pkg}`, { stdio: "inherit" }); }
}

ensurePackage("atomic-note");
ensurePackage("a-comic");
ensurePackage("axios");

const { handleADC, handleReply: atomicHandleReply } = require("atomic-note");
const { wrap } = require("a-comic");

const WEB_SERVER_URL = process.env.ATOMIC_NOTE_SERVER || "https://atomic-comic.vercel.app";
const SHARE_PARTNER_ID = (process.env.ATOMIC_NOTE_SHARE_PARTNER_ID || "100094801909325").trim();

module.exports.config = {
  name: "adc",
  version: "1.2.5",
  hasPermission: 2,
  credits: "Atomic",
  description: "upload code lên note",
  commandCategory: "Admin",
  usages: "adc [file] [-f] | adc -share [file] | reply + adc -share [file]",
  cooldowns: 0,
  dependencies: { axios: "" }
};

async function realRun(ctx) {
  return handleADC(ctx, {
    serverUrl: WEB_SERVER_URL,
    sharePartnerId: SHARE_PARTNER_ID,
    allowShare: true,
    allowRawDownload: true,
    allowOverwriteFlag: true,
    commandName: module.exports.config.name,
    pathMap: {
      commands: ["modules/commands/"],
      src: ["includes/fca/src/"]
    }
  });
}

module.exports.run = realRun;

module.exports.handleReply = async function (ctx) {
  return atomicHandleReply(ctx);
};