const fs = require("fs-extra");
const path = __dirname + '/checktt/';
const moment = require('moment-timezone');

module.exports.config = {
  name: "check",
  version: "1.7.7",
  hasPermssion: 0,
  credits: "Atomic",
  description: "Check tương tác, xếp hạng, reset dữ liệu nhóm",
  commandCategory: "Thành Viên",
  usages: "[all/day/week/list/reset]",
  cooldowns: 0
};

module.exports.run = async function({ api, event, args, Threads, Users }) {
  const { threadID, messageID, senderID } = event;
  const query = args[0] ? args[0].toLowerCase() : '';
  const send = (msg) => api.sendMessage(msg, threadID, (err, info) => {
    if (!err) setTimeout(() => api.unsendMessage(info.messageID), 90000);
  }, messageID);

  if (['all', 'day', 'week'].includes(query)) {
    const filePath = path + threadID + '.json';
    if (!fs.existsSync(filePath)) return send("❎ Nhóm này chưa có dữ liệu tương tác.");

    const data = JSON.parse(fs.readFileSync(filePath));
    const dataMap = { all: data.total || [], day: data.day || [], week: data.week || [] };
    const labelMap = { all: "Tổng", day: "Trong ngày", week: "Trong tuần" };

    const threadInfo = await api.getThreadInfo(threadID);
    const memberIDs = threadInfo.participantIDs || [];

    // Lọc người đã rời nhóm
    dataMap.all = data.total = data.total.filter(u => memberIDs.includes(u.id));
    dataMap.week = data.week = data.week.filter(u => memberIDs.includes(u.id));
    dataMap.day = data.day = data.day.filter(u => memberIDs.includes(u.id));
    data.last.day = data.last.day.filter(u => memberIDs.includes(u.id));
    data.last.week = data.last.week.filter(u => memberIDs.includes(u.id));

    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));

    const list = dataMap[query].sort((a, b) => b.count - a.count);
    const members = await Promise.all(
      list.map(async (u, i) => {
        const name = await Users.getNameUser(u.id) || 'Không tên';
        return `${i + 1}. ${name} - ${u.count.toLocaleString()} tin nhắn`;
      })
    );

    const yourRank = list.findIndex(u => u.id === senderID);
    const yourCount = list[yourRank]?.count || 0;
    const yourName = await Users.getNameUser(senderID) || "Bạn";

    const msg =
      `📊 BẢNG XẾP HẠNG TƯƠNG TÁC\n ⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯\n\n` +
      members.join("\n\n") +
      `\n\n💬 Tổng tin nhắn ${labelMap[query].toLowerCase()}: ${list.reduce((a, b) => a + b.count, 0).toLocaleString()}` +
      `\n\n⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯\n🏅 ${yourName} đang đứng hạng ${yourRank + 1} với ${yourCount.toLocaleString()} tin nhắn.` +
      `\n\n📌 Reply số thứ tự (cách nhau bằng dấu cách hoặc dấu phẩy) để xoá nhiều thành viên khỏi nhóm.`;

    return api.sendMessage(msg, threadID, (err, info) => {
      if (!err) {
        global.client.handleReply.push({
          name: module.exports.config.name,
          type: "removeUser",
          messageID: info.messageID,
          author: senderID,
          users: list
        });
        setTimeout(() => api.unsendMessage(info.messageID), 90000);
      }
    }, messageID);
  }

  if (query === 'list') {
    if (!global.config.ADMINBOT?.includes(senderID)) {
      return send("❎ Mày đủ tuổi dùng à?");
    }

    const threads = await api.getThreadList(100, null, ["INBOX"]);
    const groupThreads = threads.filter(t => t.isGroup);
    const today = moment.tz("Asia/Ho_Chi_Minh").day();

    const threadInfos = await Promise.all(
      groupThreads.map(async (t) => {
        const filePath = path + t.threadID + ".json";
        let totalCount = 0;

        if (!fs.existsSync(filePath)) {
          const newObj = {
            total: [], week: [], day: [], time: today,
            last: { time: today, day: [], week: [] }
          };
          fs.writeFileSync(filePath, JSON.stringify(newObj, null, 2));
        } else {
          const data = JSON.parse(fs.readFileSync(filePath));
          totalCount = (data.total || []).reduce((a, b) => a + b.count, 0);
        }

        return {
          id: t.threadID,
          name: t.name || "Không xác định",
          totalCount
        };
      })
    );

    const msg =
      "📋 DANH SÁCH NHÓM BOT ĐANG Ở\n⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯\n\n" +
      threadInfos.map((t, i) => `${i + 1}. ${t.name} \n🆔 ${t.id}\n   💬 Tổng tin nhắn: ${t.totalCount.toLocaleString()}`).join("\n\n") +
      `\n\n⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯\n📌 Reply số thứ tự để xoá và tạo lại dữ liệu nhóm tương ứng.`;

    return api.sendMessage(msg, threadID, (err, info) => {
      if (!err) {
        global.client.handleReply.push({
          name: module.exports.config.name,
          messageID: info.messageID,
          author: senderID,
          data: threadInfos
        });
        setTimeout(() => api.unsendMessage(info.messageID), 23000);
      }
    }, messageID);
  }

  if (query === 'reset') {
  const targetID = threadID;
    const filePath = path + targetID + ".json";
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

    try {
      const threadInfo = await api.getThreadInfo(targetID);
      const today = moment.tz("Asia/Ho_Chi_Minh").day();
      const members = threadInfo.participantIDs || [];

      const newObj = {
        total: [], week: [], day: [], time: today,
        last: { time: today, day: [], week: [] }
      };

      for (const id of members) {
        newObj.total.push({ id, count: 0 });
        newObj.week.push({ id, count: 0 });
        newObj.day.push({ id, count: 0 });
        newObj.last.week.push({ id, count: 0 });
        newObj.last.day.push({ id, count: 0 });
      }

      fs.writeFileSync(filePath, JSON.stringify(newObj, null, 2));
      return send(`✅ Đã reset và tạo lại dữ liệu cho nhóm ${targetID}`);
    } catch {
      return send("❌ Không thể lấy thông tin nhóm để tạo lại dữ liệu.");
    }
  }

  return send(
    `❓ Dùng lệnh:\n` +
    `• check all → Xem tương tác tổng\n` +
    `• check day → Tương tác hôm nay\n` +
    `• check week → Tương tác tuần\n` +
    `• check list → Xem nhóm (admin bot)\n` +
    `• check reset → Reset dữ liệu nhóm hiện tại`
  );
};

module.exports.handleReply = async function({ api, event, handleReply }) {
  const { threadID, messageID, senderID, body } = event;
  if (senderID !== handleReply.author) return;

  const send = (msg) => api.sendMessage(msg, threadID, (err, info) => {
    if (!err) setTimeout(() => api.unsendMessage(info.messageID), 15000);
  }, messageID);

  if (handleReply.type === "removeUser") {
    const threadInfo = await api.getThreadInfo(threadID);
    const isAdminBot = global.config.ADMINBOT?.includes(senderID);
    const isGroupAdmin = threadInfo.adminIDs?.some(e => e.id === senderID);
    if (!isAdminBot && !isGroupAdmin) return send("❌ Chỉ admin bot hoặc quản trị viên nhóm mới có quyền xóa thành viên.");

    const indexes = body
      .split(/[\s,]+/)
      .map(i => parseInt(i.trim()) - 1)
      .filter(i => !isNaN(i) && i >= 0 && i < handleReply.users.length);

    if (indexes.length === 0) return send("⚠️ Không có số thứ tự hợp lệ!");

    let msg = "";
    for (const i of indexes) {
      const user = handleReply.users[i];
      try {
        await api.removeUserFromGroup(user.id, threadID);
        msg += `✅ Đã xoá: ${user.id}\n`;
      } catch (e) {
        msg += `❌ Không thể xoá: ${user.id}\n`;
      }
    }

    return send(msg.trim());
  }

  const index = parseInt(body) - 1;
  const entry = handleReply.data[index];
  if (!entry) return send("⚠️ Số không hợp lệ!");

  const filePath = path + entry.id + ".json";
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

  try {
    const threadInfo = await api.getThreadInfo(entry.id);
    const today = moment.tz("Asia/Ho_Chi_Minh").day();
    const members = threadInfo.participantIDs || [];

    const newObj = {
      total: [], week: [], day: [], time: today,
      last: { time: today, day: [], week: [] }
    };

    for (const id of members) {
      newObj.total.push({ id, count: 0 });
      newObj.week.push({ id, count: 0 });
      newObj.day.push({ id, count: 0 });
      newObj.last.week.push({ id, count: 0 });
      newObj.last.day.push({ id, count: 0 });
    }

    fs.writeFileSync(filePath, JSON.stringify(newObj, null, 2));
    return send(`✅ Đã xoá và tạo lại dữ liệu nhóm: ${entry.name} (${entry.id})`);
  } catch {
    return send("❌ Không thể khởi tạo lại dữ liệu nhóm sau khi xoá.");
  }
};

module.exports.handleEvent = async function({ api, event }) {
  if (!event.isGroup || !event.senderID) return;
  const { threadID, senderID } = event;
  const filePath = path + threadID + ".json";
  const today = moment.tz("Asia/Ho_Chi_Minh").day();

  const threadInfo = await api.getThreadInfo(threadID);
  const memberIDs = threadInfo.participantIDs || [];

  let data;
  if (!fs.existsSync(filePath)) {
    data = {
      total: [], week: [], day: [], time: today,
      last: { time: today, day: [], week: [] }
    };
    for (const id of memberIDs) {
      data.total.push({ id, count: 0 });
      data.week.push({ id, count: 0 });
      data.day.push({ id, count: 0 });
      data.last.week.push({ id, count: 0 });
      data.last.day.push({ id, count: 0 });
    }
  } else {
    data = JSON.parse(fs.readFileSync(filePath));
    const clean = (arr) => arr.filter(u => memberIDs.includes(u.id));
    data.total = clean(data.total || []);
    data.week = clean(data.week || []);
    data.day = clean(data.day || []);
    data.last.day = clean(data.last?.day || []);
    data.last.week = clean(data.last?.week || []);
  }

  const update = (arr) => {
    const i = arr.findIndex(e => e.id == senderID);
    if (i === -1) arr.push({ id: senderID, count: 1 });
    else arr[i].count++;
  };

  update(data.total);
  update(data.week);
  update(data.day);

  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
};