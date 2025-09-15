module.exports.config = {
	name: "joinnoti",
	eventType: ["log:subscribe"],
	version: "1.0.1",
	credits: "Mirai Team",
	description: "Thông báo bot hoặc người vào nhóm + shareContact",
	dependencies: {
		"fs-extra": "",
		"path": "",
		"pidusage": ""
	}
};

let _0 = x => x < 10 ? '0' + x : x;
let time_str = time => {
	const d = new Date(time);
	const day = d.getDay() == 0 ? 'Chủ Nhật' : 'Thứ ' + (d.getDay() + 1);
	return `${_0(d.getHours())}:${_0(d.getMinutes())}:${_0(d.getSeconds())} - ${_0(d.getDate())}/${_0(d.getMonth() + 1)}/${d.getFullYear()} (${day})`;
};

module.exports.onLoad = function () {
	// Không còn tạo thư mục joinGif
	return;
};

module.exports.run = async function ({ api, event, Users, Threads }) {
	const { threadID } = event;
	const thread = global.data.threadData.get(threadID) || {};
	if (typeof thread["joinNoti"] != "undefined" && thread["joinNoti"] == false) return;

	// Nếu là bot mới được add
	const botID = api.getCurrentUserID();
	const isBotAdded = event.logMessageData.addedParticipants.some(participant => 
		participant.userFbId === botID || participant.userFbId == botID
	);
	
	if (isBotAdded) {
		const prefix = global.config.PREFIX || "/";
		const botName = global.config.BOTNAME || "Made by Atomic";
		
		// Kiểm tra thông tin thuê bot từ rent.js
		const fs = require("fs");
		const path = require("path");
		const rentFilePath = path.join(__dirname, "../commands/cache/data/thuebot.json");
		
		let newNickname = `[ ${prefix} ] • ${botName} | Chưa thuê`;
		let rentStatus = "Chưa thuê";
		
		try {
			if (fs.existsSync(rentFilePath)) {
				const rentData = JSON.parse(fs.readFileSync(rentFilePath, "utf-8"));
				const rentInfo = rentData.find(item => item.t_id === threadID);
				
				if (rentInfo) {
					const now = Date.now();
					const expireTime = new Date(rentInfo.expiresAt).getTime();
					
					if (expireTime > now) {
						// Nhóm vẫn còn hạn thuê
						const remaining = expireTime - now;
						const days = Math.floor(remaining / (24 * 60 * 60 * 1000));
						const hours = Math.floor((remaining % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
						const minutes = Math.floor((remaining % (60 * 60 * 1000)) / (60 * 1000));
						
						let timeText = "";
						if (days > 0) timeText += `${days} ngày `;
						if (hours > 0) timeText += `${hours} giờ `;
						if (minutes > 0 && days === 0) timeText += `${minutes} phút`;
						
						timeText = timeText.trim() || "dưới 1 phút";
						newNickname = `[ ${prefix} ] • ${botName} | ${timeText}`;
						rentStatus = `Đã thuê (còn ${timeText})`;
					}
				}
			}
		} catch (error) {
			console.error(`[JoinNoti] Lỗi khi đọc thông tin thuê:`, error);
		}
		
		try {
			// Thay đổi nickname của bot
			await api.changeNickname(newNickname, threadID, botID);
		} catch (error) {
			console.error(`[JoinNoti] Lỗi khi đổi nickname:`, error);
		}
		
		// Lấy thông tin người add bot
		let authorData = await Users.getData(event.author);
		let nameAuthor = authorData?.name || "Người dùng";
		
		const msg = `🤖 Bot được thêm vào nhóm bởi ${nameAuthor}\n─────────────────\n✅ Kết nối thành công\n⚡ Đã load toàn bộ lệnh và người dùng trong nhóm\n📋 Prefix hiện tại: ${prefix}\n🤖 Đã tự động đổi tên thành: ${newNickname}\n📊 Trạng thái thuê: ${rentStatus}\n❌ Nếu nhóm của bạn chưa kích hoạt sử dụng bot, vui lòng sử dụng lệnh 'callad' để liên hệ Admin.\n─────────────────`;
		
		// Gửi thông báo ngay lập tức
		return api.sendMessage(msg, threadID);
	}

	// Nếu là người khác được thêm vào
	try {
		let thread_data = await Threads.getData(threadID);
		let send = msg => api.sendMessage(msg, threadID);
		let asnn = thread_data?.data?.auto_set_nickname;

		// Set biệt danh tự động cho thành viên mới
		const moment = require("moment-timezone");
		const currentDate = moment.tz("Asia/Ho_Chi_Minh").format("DD/MM/YYYY");
		
		for (let { userFbId: id } of event.logMessageData.addedParticipants) {
			const newNickname = `TVM [${currentDate}]`;
			try {
				await new Promise(resolve => api.changeNickname(newNickname, threadID, id, () => resolve()));
			} catch (error) {
				console.error(`[JoinNoti] Lỗi khi đổi nickname cho ${id}:`, error);
			}
		}
		
		// Set biệt danh tự động nếu có cấu hình custom
		if (asnn?.all) {
			let time_join = time_str(Date.now() + 25200000);
			for (let { fullName, firstName, userFbId: id } of event.logMessageData.addedParticipants) {
				let name_set = asnn.all
					.replace(/\${full_name}/g, fullName)
					.replace(/\${short_name}/g, firstName)
					.replace(/\${time_join}/g, time_join);
				await new Promise(resolve => api.changeNickname(name_set, threadID, id, () => resolve()));
			}
			send(`Đã set biệt danh cho TVM`);
		}

		let { threadName, participantIDs } = await api.getThreadInfo(threadID);
		const time = moment.tz("Asia/Ho_Chi_Minh").format("HH:mm:ss - DD/MM/YYYY");
		const hours = parseInt(moment.tz("Asia/Ho_Chi_Minh").format("HH"));
		let thu = moment.tz("Asia/Ho_Chi_Minh").format("dddd");

		const mapThu = {
			"Sunday": "Chủ Nhật",
			"Monday": "Thứ Hai",
			"Tuesday": "Thứ Ba",
			"Wednesday": "Thứ Tư",
			"Thursday": "Thứ Năm",
			"Friday": "Thứ Sáu",
			"Saturday": "Thứ Bảy"
		};
		thu = mapThu[thu] || thu;

		const threadData = global.data.threadData.get(parseInt(threadID)) || {};
		let mentions = [], nameArray = [], memLength = [], iduser = [], i = 0;

		for (const user of event.logMessageData.addedParticipants) {
			const userName = user.fullName;
			iduser.push(user.userFbId.toString());
			nameArray.push(userName);
			mentions.push({ tag: userName, id: event.senderID });
			memLength.push(participantIDs.length - i++);
		}

		memLength.sort((a, b) => a - b);

		let msg = typeof threadData.customJoin == "undefined"
			? "‎[ Thành Viên Vào Nhóm ]\n─────────────────\n🎀Chào mừng {name} đã đến với box {threadName}.\n👤{type} là thành viên thứ {soThanhVien} của nhóm\n🎀 {type} được thêm bởi: {author}\n⏰ Thời gian: {time}\n📆 Vào buổi {session} {thu}"
			: threadData.customJoin;

		let authorData = await Users.getData(event.author);
		let nameAuthor = authorData?.name || "Người dùng tự vào";

		msg = msg
			.replace(/\{iduser}/g, iduser.join(', '))
			.replace(/\{name}/g, nameArray.join(', '))
			.replace(/\{type}/g, (memLength.length > 1) ? 'Các bạn' : 'Bạn')
			.replace(/\{soThanhVien}/g, memLength.join(', '))
			.replace(/\{author}/g, nameAuthor)
			.replace(/\{idauthor}/g, event.author)
			.replace(/\{threadName}/g, threadName)
			.replace(/\{thu}/g, thu)
			.replace(/\{session}/g,
				hours <= 10 ? "sáng" :
					hours <= 12 ? "trưa" :
						hours <= 18 ? "chiều" : "tối")
			.replace(/\{time}/g, time);

		// Gửi danh thiếp tới từng người mới vào
		return api.sendMessage(threadID, async () => {
			for (const participant of event.logMessageData.addedParticipants) {
				await api.shareContact(msg, participant.userFbId, threadID);
			}
		});
	} catch (e) {
		console.error('[JoinNoti] Lỗi trong quá trình xử lý:', e);
	}
};