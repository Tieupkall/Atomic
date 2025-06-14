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
let _0 = x=>x<10?'0'+x:x;
let time_str = time=>(d=>`${_0(d.getHours())}:${_0(d.getMinutes())}:${_0(d.getSeconds())} - ${_0(d.getDate())}/${_0(d.getMonth()+1)}/${d.getFullYear()} (Thứ ${d.getDay()==0?'Chủ Nhật':d.getDay()+1})`)(new Date(time));
module.exports.onLoad = function () {
    const { existsSync, mkdirSync } = global.nodemodule["fs-extra"];
    const { join } = global.nodemodule["path"];

	const path = join(__dirname, "cache", "joinGif");
	if (existsSync(path)) mkdirSync(path, { recursive: true });	

	const path2 = join(__dirname, "cache", "joinGif", "randomgif");
    if (!existsSync(path2)) mkdirSync(path2, { recursive: true });

    return;
}


module.exports.run = async function({ api, event, Users  , Threads}) {
    
	const { join } = global.nodemodule["path"];
	const { threadID } = event;
  ////////////////////////////////////////////////////////
  const thread = global.data.threadData.get(threadID) || {};
  if (typeof thread["joinNoti"] != "undefined" && thread["joinNoti"] == false) return;
  ///////////////////////////////////////////////////////
	if (event.logMessageData.addedParticipants.some(i => i.userFbId == api.getCurrentUserID())) {
		api.changeNickname(`[ ${global.config.PREFIX} ] • ${(!global.config.BOTNAME) ? "Made by Khôi" : global.config.BOTNAME}`, threadID, api.getCurrentUserID());
		const fs = require("fs");
    var mlg="Kết nối thành công\nĐã load toàn bộ lệnh và người dùng trong nhóm.\n❌ Nếu nhóm của bạn chưa kích hoạt sử dụng bot, vui lòng sử dụng lệnh 'callad' để liên hệ Admin.\n─────────────────\n🌐 Facebook: https://www.facebook.com/dthuwu"
    	return api.sendMessage(threadID,async () => {
await api.shareContact(`${mlg}`, 100013112775163, threadID);
});

	}
	else {
		try {
		  let thread_data = await Threads.getData(threadID);
		  
		  if (!!thread_data) {
		    let send = msg=>api.sendMessage(msg, threadID);
		    let asnn = thread_data && thread_data.data ? thread_data.data.auto_set_nickname : null;

    if (!!asnn && !!asnn.all) {
      let time_join = time_str(Date.now()+25200000);
      for (let {
          fullName,
          firstName,
          userFbId: id,
        } of event.logMessageData.addedParticipants)try {
          let name_set = asnn.all.replace(/\${full_name}/g, fullName).replace(/\${short_name}/g, firstName).replace(/\${time_join}/g, time_join);//eval(`(()=>\`${asnn.all}\`)()`);
          
          await new Promise(resolve=>api.changeNickname(name_set, threadID, id, (err, res)=>resolve()));
      } catch {};
      
      send(`Đã set biệt danh cho TVM`);
    };
		  };
		  
			const { createReadStream, existsSync, mkdirSync, readdirSync } = global.nodemodule["fs-extra"];
			let { threadName, participantIDs } = await api.getThreadInfo(threadID);
      const moment = require("moment-timezone");
      const time = moment.tz("Asia/Ho_Chi_Minh").format(" HH:mm:ss - DD/MM/YYYY");
      const hours = moment.tz("Asia/Ho_Chi_Minh").format("HH");
      var thu = moment.tz('Asia/Ho_Chi_Minh').format('dddd');
  if (thu == 'Sunday') thu = 'Chủ Nhật'
  if (thu == 'Monday') thu = 'Thứ Hai'
  if (thu == 'Tuesday') thu = 'Thứ Ba'
  if (thu == 'Wednesday') thu = 'Thứ Tư'
  if (thu == "Thursday") thu = 'Thứ Năm'
  if (thu == 'Friday') thu = 'Thứ Sáu'
  if (thu == 'Saturday') thu = 'Thứ Bảy'
			const threadData = global.data.threadData.get(parseInt(threadID)) || {};
			/*const path = join(__dirname, "cache", "joinGif");
			const pathGif = join(path, `join.mp4`);
*/
				var mentions = [], nameArray = [], memLength = [], iduser = [], i = 0;
			
			for (id in event.logMessageData.addedParticipants) {
		const userName = event.logMessageData.addedParticipants[id].fullName; iduser.push(event.logMessageData.addedParticipants[id].userFbId.toString());
        nameArray.push(userName);
        mentions.push({ tag: userName, id: event.senderID });
        memLength.push(participantIDs.length - i++);
        console.log(userName)
			}
			memLength.sort((a, b) => a - b);
			
			(typeof threadData.customJoin == "undefined") ? msg = "‎[ Thành Viên Vào Nhóm ]\n─────────────────\n🎀Chào mừng {name} đã đến với box {threadName}.\n👤{type} là thành viên thứ {soThanhVien} của nhóm\n🎀 {type} được thêm bởi: {author}\n⏰ Thời gian:{time}\n📆 Vào buổi {session} {thu}" : msg = threadData.customJoin;
      var getData = await Users.getData(event.author)
var nameAuthor = typeof getData.name == "undefined" ? "Người dùng tự vào" : getData.name
			msg = msg
         .replace(/\{iduser}/g, iduser.join(', '))
			.replace(/\{name}/g, nameArray.join(', '))
			.replace(/\{type}/g, (memLength.length > 1) ?  'Các bạn': 'Bạn')
			.replace(/\{soThanhVien}/g, memLength.join(', '))
         .replace(/\{author}/g, nameAuthor)
         .replace(/\{idauthor}/g, event.author)
			.replace(/\{threadName}/g, threadName)
      .replace(/\{thu}/g, thu)
      .replace(/\{session}/g, hours <= 10 ? "sáng" : 
    hours > 10 && hours <= 12 ? "trưa" :
    hours > 12 && hours <= 18 ? "chiều" : "tối")
    .replace(/\{time}/g, time);
    
			return api.sendMessage(threadID, async () => {
  for (const participant of event.logMessageData.addedParticipants) {
    await api.shareContact(`${msg}`, participant.userFbId, threadID);}
});
} catch (e) { return console.log(e) };
}
}