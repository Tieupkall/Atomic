"use strict";

let count_req = 0;

module.exports = function (defaultFuncs, api, ctx) {
	return async function sendTyping(threadID, isTyping = true, options = {}, callback = () => {}) {
		try {
			const payload = {
				app_id: 2220391788200892,
				payload: JSON.stringify({
					label: 3,
					payload: JSON.stringify({
						thread_key: threadID.toString(),
						is_group_thread: +(threadID.toString().length >= 16),
						is_typing: +isTyping,
						attribution: 0
					}),
					version: 5849951561777440
				}),
				request_id: ++count_req,
				type: 4
			};

			await new Promise((resolve, reject) =>
				ctx.mqttClient.publish('/ls_req', JSON.stringify(payload), {}, err => err ? reject(err) : resolve())
			);

			callback(null, { success: true });
		} catch (err) {
			callback(err, null);
		}
	};
};