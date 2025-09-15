const fs = require("fs");
const path = require("path");
const axios = require("axios");

const BANK_MAP_PATH = path.join(__dirname, "../../data/sepay/bank.json");

function ensureBankMap() {
  const d = path.dirname(BANK_MAP_PATH);
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
  if (!fs.existsSync(BANK_MAP_PATH)) fs.writeFileSync(BANK_MAP_PATH, "[]", "utf8");
}

function loadCodes() {
  ensureBankMap();
  try {
    return JSON.parse(fs.readFileSync(BANK_MAP_PATH, "utf-8"));
  } catch {
    return [];
  }
}

function saveCodes(arr) {
  fs.writeFileSync(BANK_MAP_PATH, JSON.stringify(arr, null, 2), "utf8");
}

function randomCode6() {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let s = "";
  for (let i = 0; i < 6; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

function removeExpiredCodes(maxAgeMs = 600000) {
  const now = Date.now();
  const arr = loadCodes();
  const filtered = arr.filter(x => now - (x.createdAt || 0) < maxAgeMs);
  if (filtered.length !== arr.length) saveCodes(filtered);
}

function addNewCodeForThread(threadID) {
  const now = Date.now();
  const maxAgeMs = 600000;
  const existingCodes = loadCodes();
  const validCode = existingCodes.find(x =>
    String(x.threadID) === String(threadID) &&
    (now - (x.createdAt || 0)) < maxAgeMs
  );
  if (validCode) return validCode.code;
  const code = randomCode6();
  let arr = loadCodes().filter(x => String(x.threadID) !== String(threadID));
  arr.push({ threadID: String(threadID), code, createdAt: now });
  saveCodes(arr);
  return code;
}

setInterval(removeExpiredCodes, 60000);

let config;
try {
  config = JSON.parse(fs.readFileSync(path.join(__dirname, "../../config.json"), "utf8"));
} catch {
  config = {};
}

const BANK = {
  bankCode: "970422",
  accountNumber: "0974927984",
  accountName: "DINH TRONG HOAI",
  defaultAmount: 2000
};

function headerByPurpose(purpose) {
  if (purpose === "renew") return "🔄 Gia hạn bot cho nhóm.";
  return "⚠️ Nhóm chưa được kích hoạt bot.";
}

async function generateQR(groupID, amountOrOptions) {
  const isObj = typeof amountOrOptions === "object" && amountOrOptions !== null;
  const amount = isObj ? (amountOrOptions.amount ?? BANK.defaultAmount) : (amountOrOptions ?? BANK.defaultAmount);
  const purpose = isObj ? (amountOrOptions.purpose || "activate") : "activate";

  try {
    const now = Date.now();
    const maxAgeMs = 600000;
    const existingCodes = loadCodes();
    const validCode = existingCodes.find(x =>
      String(x.threadID) === String(groupID) &&
      (now - (x.createdAt || 0)) < maxAgeMs
    );

    let addInfo;
    let isUsingExistingCode = false;

    if (validCode) {
      addInfo = validCode.code;
      isUsingExistingCode = true;
    } else {
      addInfo = addNewCodeForThread(groupID);
    }

    const url =
      `https://img.vietqr.io/image/${BANK.bankCode}-${BANK.accountNumber}-compact.png` +
      `?amount=${amount}&addInfo=${encodeURIComponent(addInfo)}` +
      `&accountName=${encodeURIComponent(BANK.accountName)}`;

    const cacheDir = path.join(__dirname, "../../data/sepay/cache");
    if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });

    const r = await axios.get(url, { responseType: "arraybuffer", timeout: 10000 });
    const filePath = path.join(cacheDir, `qr_${groupID}_${Date.now()}.png`);
    fs.writeFileSync(filePath, r.data);

    let message;
    if (isUsingExistingCode) {
      const remainingTime = Math.ceil((maxAgeMs - (now - validCode.createdAt)) / 60000);
      message =
        `${headerByPurpose(purpose)}\n` +
        `➡️ Giữ nguyên nội dung chuyển khoản: ${addInfo}\n` +
        `⏳ Mã còn hiệu lực ${remainingTime} phút.`;
    } else {
      message =
        `${headerByPurpose(purpose)}\n` +
        `➡️ Giữ nguyên nội dung chuyển khoản: ${addInfo}\n` +
        `⏳ Mã có hiệu lực 10 phút.`;
    }

    return { success: true, message, filePath, bankInfo: BANK, code: addInfo, purpose };
  } catch {
    return { success: false, error: "❌ Lỗi tạo QR code." };
  }
}

async function sendQRToGroup(api, threadID, amountOrOptions) {
  const result = await generateQR(threadID, amountOrOptions);
  if (!result.success) return api.sendMessage(result.error, threadID);

  return api.sendMessage(
    { body: result.message, attachment: fs.createReadStream(result.filePath) },
    threadID,
    () => {
      try { if (fs.existsSync(result.filePath)) fs.unlinkSync(result.filePath); } catch {}
      setTimeout(() => {
        const purposeText = result.purpose === "renew" ? "Cần hỗ trợ gia hạn bot" : "Cần hỗ trợ kích hoạt bot";
        shareContactToGroup(api, threadID, `📞 Liên hệ admin để được hỗ trợ\n${purposeText}.`);
      }, 1500);
    }
  );
}

async function shareContactToGroup(api, threadID, customMessage = null) {
  try {
    const adminFB = config.FACEBOOK_ADMIN || "https://www.facebook.com/100013112775163";
    const adminID = config.ADMINBOT && config.ADMINBOT[0] ? config.ADMINBOT[0] : "100013112775163";
    const contactMessage = customMessage || "📞 Liên hệ admin để được hỗ trợ.";
    return api.shareContact(contactMessage, adminID, threadID, (error, info) => {
      if (!error && info) {
        setTimeout(() => api.unsendMessage(info.messageID, () => {}), 3000);
      } else if (error) {
        return api.sendMessage(contactMessage + `\n\n🔗 Link: ${adminFB}`, threadID);
      }
    });
  } catch {
    return api.sendMessage("❌ Có lỗi xảy ra khi chia sẻ thông tin liên hệ admin!", threadID);
  }
}

module.exports = { generateQR, sendQRToGroup, shareContactToGroup, BANK };