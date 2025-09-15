module.exports.config = {
	name: "typ",
	version: "1.0.0",
	hasPermssion: 0,
	credits: "dongdev",
	description: "Test typing",
	commandCategory: "Admin",
	usages: "[basic|options|callback|full]",
	cooldowns: 5
};

module.exports.run = async function({ api, event, args }) {
	const threadID = event.threadID;
	const type = args[0] || "basic";

	switch (type) {
		case "basic":
			await api.sendTyping(threadID, true);
			setTimeout(async () => {
				await api.sendTyping(threadID, false);
				api.sendMessage("✅ Basic typing test completed", threadID);
			}, 2000);
			break;

		case "options":
			await api.sendTyping(threadID, true);
			setTimeout(() => {
				api.sendMessage("✅ Options typing test completed", threadID);
			}, 5000);
			break;

		case "callback":
			api.sendTyping(threadID, true, (err, res) => {
				if (err) console.error("Callback error:", err);
				else console.log("Typing ON sent via callback");
			});
			setTimeout(() => {
				api.sendTyping(threadID, false);
				api.sendMessage("✅ Callback typing test completed", threadID);
			}, 3000);
			break;

		case "full":
			api.sendTyping(threadID, true, { duration: 3000 }, (err, res) => {
				if (err) console.error("Full typing error:", err);
				else console.log("Typing with options + callback");
			});
			setTimeout(() => {
				api.sendMessage("✅ Full typing test completed", threadID);
			}, 3000);
			break;

		default:
			api.sendMessage("❌ Invalid type. Use: basic, options, callback, or full", threadID);
	}
};
