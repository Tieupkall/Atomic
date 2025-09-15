module.exports.config = {
    name: "leavenoti",
    eventType: ["log:unsubscribe"],
    version: "1.0.1",
    credits: "HĐGN - mod by Atomic",
    description: "Thông báo Bot hoặc người dùng rời khỏi nhóm + shareContact",
    dependencies: {
        "fs-extra": "",
        "path": ""
    }
};

const checkttPath = __dirname + '/../commands/_checktt/'

module.exports.onLoad = function () {
    const { existsSync, mkdirSync } = global.nodemodule["fs-extra"];
    const { join } = global.nodemodule["path"];
    const checkPath = join(__dirname, "cache");
    if (!existsSync(checkPath)) mkdirSync(checkPath, { recursive: true });
    return;
};

module.exports.run = async function ({ api, event, Users, Threads }) {
    if (event.logMessageData.leftParticipantFbId == api.getCurrentUserID()) return;

    const { existsSync, readFileSync, writeFileSync } = global.nodemodule["fs-extra"];
    const { join } = global.nodemodule["path"];
    const { threadID } = event;
    const moment = require("moment-timezone");
    const time = moment.tz("Asia/Ho_Chi_Minh").format("HH:mm:ss - DD/MM/YYYY");
    const hours = moment.tz("Asia/Ho_Chi_Minh").format("HH");
    let thu = moment.tz('Asia/Ho_Chi_Minh').format('dddd');

    // Đổi tên thứ sang tiếng Việt
    const thuMap = {
        Sunday: 'Chủ Nhật',
        Monday: 'Thứ Hai',
        Tuesday: 'Thứ Ba',
        Wednesday: 'Thứ Tư',
        Thursday: 'Thứ Năm',
        Friday: 'Thứ Sáu',
        Saturday: 'Thứ Bảy'
    };
    thu = thuMap[thu] || thu;

    const data = global.data.threadData.get(parseInt(threadID)) || (await Threads.getData(threadID)).data;
    const name = global.data.userName.get(event.logMessageData.leftParticipantFbId) || await Users.getNameUser(event.logMessageData.leftParticipantFbId);
    const uid = event.logMessageData.leftParticipantFbId;
    const type = (event.author == event.logMessageData.leftParticipantFbId)
        ? "Đã tự động rời khỏi nhóm."
        : "Đã bị Quản trị viên xóa khỏi nhóm.";

    // Xoá dữ liệu tương tác
    if (existsSync(checkttPath + threadID + '.json')) {
        const threadData = JSON.parse(readFileSync(checkttPath + threadID + '.json'));
        ["total", "week", "day"].forEach(key => {
            const index = threadData[key].findIndex(e => e.id == uid);
            if (index !== -1) threadData[key].splice(index, 1);
        });
        writeFileSync(checkttPath + threadID + '.json', JSON.stringify(threadData, null, 4));
    }

    // Tạo tin nhắn rời nhóm
    let msg;
    if (event.author != event.logMessageData.leftParticipantFbId) {
        msg = "✅ Cút 1 con vợ";
    } else {
        msg = typeof data.customLeave == "undefined"
            ? "[ Thành Viên Thoát Nhóm ]\n─────────────────\n👤 Thành viên: {name}\n📌 Lý do: {type}\n📆 Thoát nhóm vào lúc {thu}\n⏰ Thời gian: {time}"
            : data.customLeave;
    }

    msg = msg
        .replace(/\{name}/g, name)
        .replace(/\{type}/g, type)
        .replace(/\{time}/g, time)
        .replace(/\{uid}/g, uid)
        .replace(/\{thu}/g, thu);

    return api.sendMessage(threadID, async () => {
        await api.shareContact(`${msg}`, uid, threadID);
    });
};