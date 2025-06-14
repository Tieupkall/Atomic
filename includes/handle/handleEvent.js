const fs = require("fs");
const path = require("path");
const moment = require("moment");

module.exports = function ({ api, models, Users, Threads, Currencies }) {
	const logger = require("../../utils/log.js");

	const thuebotPath = path.join(__dirname, "../../modules/commands/cache/data/thuebot.json");
	const lastCheckPath = path.join(__dirname, "../../modules/commands/cache/data/lastCheck.json");

	// Đảm bảo thư mục tồn tại
	const ensureDirectoryExists = () => {
		const dir = path.dirname(thuebotPath);
		if (!fs.existsSync(dir)) {
			fs.mkdirSync(dir, { recursive: true });
		}
	};

	// Hàm tính thời gian còn lại (đồng bộ với rent.js và upbot.js)
	const calculateTimeRemaining = (expiresAt) => {
		const now = Date.now();
		const expireTime = new Date(expiresAt).getTime();
		const remaining = expireTime - now;
		
		if (remaining <= 0) return null;
		
		const days = Math.floor(remaining / (24 * 60 * 60 * 1000));
		const hours = Math.floor((remaining % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
		const minutes = Math.floor((remaining % (60 * 60 * 1000)) / (60 * 1000));
		
		let timeText = "";
		if (days > 0) timeText += `${days} ngày`;
		if (hours > 0) {
			if (timeText) timeText += " ";
			timeText += `${hours} giờ`;
		}
		if (minutes > 0 && days === 0) { // Chỉ hiện phút nếu dưới 1 ngày
			if (timeText) timeText += " ";
			timeText += `${minutes} phút`;
		}
		
		return timeText.trim() || "dưới 1 phút";
	};

	// Hàm làm sạch dữ liệu hết hạn
	const cleanExpiredData = (thuebotData) => {
		const now = Date.now();
		return thuebotData.filter(item => {
			const expireTime = new Date(item.expiresAt).getTime();
			return expireTime > now;
		});
	};

	// ✅ Kiểm tra và xử lý nhóm hết hạn thuê bot
	async function checkExpiredRentGroups() {
		const botID = api.getCurrentUserID();
		const botName = global.config.BOTNAME || "Bot";

		ensureDirectoryExists();

		let thuebot;
		try {
			if (!fs.existsSync(thuebotPath)) {
				fs.writeFileSync(thuebotPath, JSON.stringify([], null, 2), "utf-8");
				thuebot = [];
			} else {
				thuebot = JSON.parse(fs.readFileSync(thuebotPath, "utf-8"));
			}
		} catch (err) {
			console.error("❌ [handleEvent] Lỗi đọc file thuebot.json:", err);
			return;
		}

		const now = Date.now();
		const expired = [];
		const soonExpired = [];
		const stillValid = [];

		// Phân loại các nhóm
		thuebot.forEach(item => {
			const expireTime = new Date(item.expiresAt).getTime();
			const remaining = expireTime - now;
			const hoursLeft = remaining / (60 * 60 * 1000);

			if (remaining <= 0) {
				expired.push(item);
			} else if (hoursLeft <= 24) {
				soonExpired.push({
					...item,
					timeLeft: calculateTimeRemaining(item.expiresAt)
				});
				stillValid.push(item);
			} else {
				stillValid.push(item);
			}
		});

		// Xử lý nhóm hết hạn
		for (const item of expired) {
			console.log(`[⏰] Nhóm ${item.groupName || item.t_id} đã hết hạn thuê bot (hết hạn lúc ${item.expiresAt}).`);
			try {
				await api.changeNickname(`${botName} | Chưa thuê`, item.t_id, botID);
				console.log(`✅ Đã đổi biệt danh nhóm ${item.groupName || item.t_id} thành "${botName} | Chưa thuê"`);
				
				// Delay nhỏ để tránh spam API
				await new Promise(resolve => setTimeout(resolve, 200));
			} catch (e) {
				console.error(`❌ Không thể đổi tên nhóm ${item.groupName || item.t_id}:`, e.message || e);
			}
		}

		// Thông báo cho admin về nhóm hết hạn
		if (expired.length > 0) {
			const adminIDs = global.config.ADMINBOT || [];
			const expiredMsg = `⚠️ CÓ ${expired.length} NHÓM ĐÃ HẾT HẠN THUÊ:\n\n` +
							  expired.map((item, i) => 
								`${i + 1}. ${item.groupName || 'Không tên'}\n   ID: ${item.t_id}\n   Hết hạn: ${new Date(item.expiresAt).toLocaleString('vi-VN')}`
							  ).join('\n\n');

			for (const adminID of adminIDs) {
				try {
					await api.sendMessage(expiredMsg, adminID);
					await new Promise(resolve => setTimeout(resolve, 100));
				} catch (e) {
					console.error(`❌ Không thể gửi thông báo cho admin ${adminID}:`, e.message);
				}
			}
		}

		// Thông báo về nhóm sắp hết hạn (chỉ 1 lần/ngày)
		if (soonExpired.length > 0) {
			const adminIDs = global.config.ADMINBOT || [];
			const soonExpiredMsg = `🔔 CÓ ${soonExpired.length} NHÓM SẮP HẾT HẠN TRONG 24H:\n\n` +
								   soonExpired.map((item, i) => 
									 `${i + 1}. ${item.groupName || 'Không tên'}\n   ID: ${item.t_id}\n   ⏰ Còn: ${item.timeLeft}`
								   ).join('\n\n');

			for (const adminID of adminIDs) {
				try {
					await api.sendMessage(soonExpiredMsg, adminID);
					await new Promise(resolve => setTimeout(resolve, 100));
				} catch (e) {
					console.error(`❌ Không thể gửi cảnh báo cho admin ${adminID}:`, e.message);
				}
			}
		}

		// Lưu dữ liệu đã làm sạch
		try {
			fs.writeFileSync(thuebotPath, JSON.stringify(stillValid, null, 2), "utf-8");
			fs.writeFileSync(lastCheckPath, JSON.stringify({ 
				lastDate: new Date().toDateString(),
				lastCheckTime: new Date().toISOString(),
				expiredCount: expired.length,
				soonExpiredCount: soonExpired.length,
				totalValid: stillValid.length
			}), "utf-8");
			
			if (expired.length > 0) {
				console.log(`🧹 [handleEvent] Đã dọn dẹp ${expired.length} nhóm hết hạn`);
			}
		} catch (err) {
			console.error("❌ [handleEvent] Lỗi ghi file sau khi cập nhật:", err);
		}
	}

	// ✅ Đồng bộ tên bot cho tất cả nhóm (chạy định kỳ)
	async function syncAllBotNames() {
		const botID = api.getCurrentUserID();
		const botName = global.config.BOTNAME || "Bot";

		let threads = [];
		try {
			threads = await api.getThreadList(100, null, ["INBOX"]);
		} catch (e) {
			console.error("[handleEvent] ❌ Không thể lấy danh sách nhóm để sync:", e.message);
			return;
		}

		const groups = threads.filter(t => t.isGroup);
		let thuebot;

		try {
			thuebot = fs.existsSync(thuebotPath) ? JSON.parse(fs.readFileSync(thuebotPath, "utf-8")) : [];
		} catch (err) {
			console.error("❌ [handleEvent] Lỗi đọc file thuebot.json khi sync:", err);
			return;
		}

		// Làm sạch dữ liệu hết hạn
		const cleanedData = cleanExpiredData(thuebot);
		if (cleanedData.length !== thuebot.length) {
			try {
				fs.writeFileSync(thuebotPath, JSON.stringify(cleanedData, null, 2), "utf-8");
				thuebot = cleanedData;
			} catch (err) {
				console.error("❌ [handleEvent] Lỗi lưu dữ liệu đã làm sạch:", err);
			}
		}

		let syncCount = 0;
		for (const group of groups) {
			try {
				const entry = thuebot.find(e => e.t_id === group.threadID);
				let newNick = `${botName} | Chưa thuê`;
				
				if (entry) {
					const timeRemaining = calculateTimeRemaining(entry.expiresAt);
					if (timeRemaining) {
						newNick = `${botName} | ${timeRemaining}`;
					}
				}
				
				await api.changeNickname(newNick, group.threadID, botID);
				syncCount++;
				
				// Delay để tránh spam API
				await new Promise(resolve => setTimeout(resolve, 300));
			} catch (err) {
				console.log(`[handleEvent] ❌ Sync ${group.name || group.threadID}: ${err.message}`);
			}
		}
		
		console.log(`[handleEvent] ✅ Đã đồng bộ tên bot cho ${syncCount}/${groups.length} nhóm`);
	}

	// Biến đếm để kiểm soát tần suất sync
	let eventCount = 0;
	let lastSyncTime = 0;

	// ✅ Hàm xử lý sự kiện chính
	return async function ({ event }) {
		const timeStart = Date.now();
		const time = moment.tz("Asia/Ho_Chi_Minh").format("HH:mm:ss L");
		const { userBanned, threadBanned } = global.data;
		const { events } = global.client;
		const { allowInbox, DeveloperMode } = global.config;
		var { senderID, threadID } = event;
		senderID = String(senderID);
		threadID = String(threadID);
		if (userBanned.has(senderID) || threadBanned.has(threadID) || allowInbox === false && senderID === threadID) return;

		// ✅ Kiểm tra hết hạn thuê nếu hôm nay chưa kiểm tra
		const today = new Date().toDateString();
		let lastChecked = null;

		if (fs.existsSync(lastCheckPath)) {
			try {
				const data = JSON.parse(fs.readFileSync(lastCheckPath, "utf-8"));
				lastChecked = data.lastDate;
			} catch {}
		}

		if (lastChecked !== today) {
			await checkExpiredRentGroups();
		}

		// ✅ Đồng bộ tên bot định kỳ (mỗi 100 event hoặc mỗi 30 phút)
		eventCount++;
		const now = Date.now();
		const thirtyMinutes = 30 * 60 * 1000;

		if (eventCount >= 100 || (now - lastSyncTime) >= thirtyMinutes) {
			eventCount = 0;
			lastSyncTime = now;
			
			// Chạy sync trong background để không block event
			setImmediate(async () => {
				await syncAllBotNames();
			});
		}

		// ✅ Xử lý các sự kiện từ client.events
		for (const [key, value] of events.entries()) {
			if (value.config.eventType.includes(event.logMessageType)) {
				const eventRun = events.get(key);
				try {
					const Obj = { api, event, models, Users, Threads, Currencies };
					await eventRun.run(Obj);
					if (DeveloperMode === true)
						logger(global.getText('handleEvent', 'executeEvent', time, eventRun.config.name, threadID, Date.now() - timeStart), '[ Event ]');
				} catch (error) {
					logger(global.getText('handleEvent', 'eventError', eventRun.config.name, JSON.stringify(error)), "error");
				}
			}
		}
	};
};