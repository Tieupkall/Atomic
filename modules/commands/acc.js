const fs = require("fs");
const path = require("path");

module.exports.config = {
  name: "acc",
  version: "1.0.1",
  hasPermssion: 2,
  credits: "Atomic",
  description: "change account",
  commandCategory: "Admin",
  usages: "",
  cooldowns: 5
};

module.exports.run = async function({ api, event }) {
  const { threadID, messageID, senderID } = event;
  try {
    const loginModule = require('../../includes/login/loginandby.js');
    const current = loginModule.getCurrentAccount();
    const accounts = loginModule.getAllAccounts();

    if (!accounts || Object.keys(accounts).length === 0) {
      return api.sendMessage('❌ No accounts found', threadID, messageID);
    }

    let menu = '📱 Account Manager\n\n';
    let index = 1;
    const accountList = [];

    for (const [name, data] of Object.entries(accounts)) {
      const status = name === current ? '🟢 (current)' : '⚪';
      const email = data && data.EMAIL ? data.EMAIL : 'N/A';
      menu += `${index}. ${status} ${name}\n   📧 ${email}\n\n`;
      accountList.push(name);
      index++;
    }

    menu += '📋 Reply số để chuyển tài khoản';

    api.sendMessage(menu, threadID, (err, info) => {
      if (err) return;
      global.client.handleReply.push({
        name: module.exports.config.name,
        messageID: info.messageID,
        author: senderID,
        accounts: accountList,
        current
      });
      setTimeout(() => {
        const i = global.client.handleReply.findIndex(r => r.messageID === info.messageID);
        if (i !== -1) global.client.handleReply.splice(i, 1);
      }, 60000);
    }, messageID);

  } catch (error) {
    api.sendMessage(`❌ ${error.message}`, threadID, messageID);
  }
};

module.exports.handleReply = async function({ api, event, handleReply }) {
  const { threadID, messageID, senderID, body } = event;
  if (senderID !== handleReply.author) return;

  const choice = parseInt(String(body).trim(), 10);
  if (!Number.isInteger(choice) || choice < 1 || choice > handleReply.accounts.length) {
    api.sendMessage('❌ Số không hợp lệ', threadID, messageID);
    return;
  }

  const target = handleReply.accounts[choice - 1];
  if (target === handleReply.current) {
    api.sendMessage(`⚠️ Đã đang dùng '${target}'`, threadID, messageID);
  } else {
    try {
      api.sendMessage(`🔄 Đang chuyển sang '${target}'...`, threadID, messageID);
      const loginModule = require('../../includes/login/loginandby.js');
      const ok = await loginModule.switchAccount(target, { noRestart: true });
      if (ok) {
        const pendingPath = path.join(__dirname, '../../data/pending_switch.json');
        fs.writeFileSync(pendingPath, JSON.stringify({ threadID, target, time: Date.now() }, null, 2), 'utf8');
        setTimeout(() => process.exit(1), 800);
      } else {
        api.sendMessage(`❌ Chuyển đổi thất bại`, threadID, messageID);
      }
    } catch (error) {
      api.sendMessage(`❌ ${error.message}`, threadID, messageID);
    }
  }

  const index = global.client.handleReply.findIndex(r => r.messageID === handleReply.messageID);
  if (index !== -1) global.client.handleReply.splice(index, 1);
};