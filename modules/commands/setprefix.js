const fs = require("fs");
const path = require("path");

module.exports.config = {
	name: "setprefix",
	version: "2.0.8",
	hasPermssion: 1,
	credits: "BraSL", // fix by Atomic
	description: "Đặt lại prefix của nhóm",
	commandCategory: "Nhóm",
	usages: "[prefix/reset]",
	cooldowns: 5
};

const uid = global.config.UIDBOT;
global.prefixTO = {};

const thuebotFilePath = path.join(__dirname, "cache", "data", "thuebot.json");

const readThuebot = () => {
	try {
		if (!fs.existsSync(thuebotFilePath)) return [];
		const data = fs.readFileSync(thuebotFilePath, "utf-8");
		return JSON.parse(data);
	} catch (error) {
		console.error("Lỗi đọc file thuebot.json:", error);
		return [];
	}
};

const calculateTimeRemaining = (expiresAt) => {
	const now = Date.now();
	const expireTime = new Date(expiresAt).getTime();
	const remaining = expireTime - now;

	if (remaining <= 0) return null;

	const days = Math.floor(remaining / (24 * 60 * 60 * 1000));
	const hours = Math.floor((remaining % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
	const minutes = Math.floor((remaining % (60 * 60 * 1000)) / (60 * 1000));

	let timeText = "";
	if (days > 0) timeText += `${days} ngày `;
	if (hours > 0) timeText += `${hours} giờ `;
	if (minutes > 0) timeText += `${minutes} phút`;

	return timeText.trim() || "dưới 1 phút";
};

const getRentStatus = (threadID) => {
	const thuebot = readThuebot();
	const entry = thuebot.find(e => e.t_id === threadID);
	if (!entry) return "Chưa thuê";

	const timeRemaining = calculateTimeRemaining(entry.expiresAt);
	return timeRemaining || "Chưa thuê";
};

const createBotNickname = (prefix, threadID) => {
	const rentStatus = getRentStatus(threadID);
	const botName = global.config.BOTNAME || "Bot";

	if (rentStatus === "Chưa thuê") {
		return `[ ${prefix} ] • ${botName} | Chưa thuê`;
	} else {
		return `[ ${prefix} ] • ${botName} | ${rentStatus}`;
	}
};

module.exports.handleEvent = async ({ api, event, Threads }) => {
	if (!event.body) return;
	const { threadID, messageID } = event;

	if (event.body.toLowerCase() == "prefix") {
		const prefix = global.prefixTO[threadID] || (await Threads.getData(String(threadID))).data?.PREFIX || global.config.PREFIX;
		api.sendMessage({
			body: `Prefix của hệ thống: ${global.config.PREFIX}\nPrefix của nhóm bạn: ${prefix}`,
			attachment: global.krystal.splice(0, 1)
		}, threadID, messageID);
	}
};

module.exports.handleReaction = async function ({ api, event, Threads, handleReaction }) {
	try {
		if (event.userID != handleReaction.author) return;
		const { threadID, messageID } = event;
		const newPrefix = handleReaction.PREFIX;

		const data = (await Threads.getData(String(threadID))).data || {};
		data["PREFIX"] = newPrefix;
		await Threads.setData(threadID, { data });
		global.prefixTO[threadID] = newPrefix;

		const newNickname = createBotNickname(newPrefix, threadID);
		await api.changeNickname(newNickname, threadID, api.getCurrentUserID());

		api.unsendMessage(handleReaction.messageID);
		return api.sendMessage(`✅ Đã chuyển đổi prefix của nhóm thành: ${newPrefix}`, threadID, messageID);
	} catch (e) {
		console.error("Lỗi xử lý reaction:", e);
	}
};

module.exports.run = async ({ api, event, args, Threads }) => {
	const prefix = args[0]?.trim();
	if (!prefix) return api.sendMessage('❎ Phần prefix cần đặt không được để trống', event.threadID, event.messageID);

	if (prefix === "reset") {
		try {
			const data = (await Threads.getData(event.threadID)).data || {};
			data["PREFIX"] = global.config.PREFIX;
			await Threads.setData(event.threadID, { data });
			await global.data.threadData.set(String(event.threadID), data);
			global.prefixTO[event.threadID] = global.config.PREFIX;

			// Tạo nickname mới với prefix đã reset
			const resetNickname = createBotNickname(global.config.PREFIX, event.threadID);
			
			// Cập nhật nickname cho bot
			try {
				if (uid && Array.isArray(uid) && uid.length > 0) {
					// Nếu có nhiều bot ID, cập nhật cho tất cả
					for (const botId of uid) {
						await api.changeNickname(resetNickname, event.threadID, botId);
					}
				} else {
					// Nếu không có UID config, dùng current user ID
					await api.changeNickname(resetNickname, event.threadID, api.getCurrentUserID());
				}
			} catch (nicknameError) {
				console.error("⚠️ Lỗi khi cập nhật nickname:", nicknameError);
				// Không throw error, vẫn tiếp tục thực hiện reset prefix
			}

			return api.sendMessage(`✅ Đã reset prefix về mặc định: ${global.config.PREFIX}`, event.threadID, event.messageID);
		} catch (err) {
			console.error("❌ Lỗi khi reset prefix:", err);
			return api.sendMessage("❌ Đã xảy ra lỗi khi reset prefix. Vui lòng thử lại.", event.threadID, event.messageID);
		}
	} else {
		return api.sendMessage(`Bạn muốn đổi prefix thành: ${prefix}\nThả cảm xúc để xác nhận`, event.threadID, (error, info) => {
			global.client.handleReaction.push({
				name: "setprefix",
				messageID: info.messageID,
				author: event.senderID,
				PREFIX: prefix
			});
		});
	}
};