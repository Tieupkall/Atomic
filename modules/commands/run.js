module.exports.config = {
	name: "run",
	version: "1.0.3",
	hasPermission: 2,
	credits: "Mirai Team", 
	description: "Execute shell-level JS code (owner only)",
	commandCategory: "system",
	usages: "[script]",
	cooldowns: 5
};

module.exports.run = async function({ api, event, args, Threads, Users, Currencies, models, getText }) {
	const { threadID, messageID } = event;
	const code = args.join(" ");
	
	// Check if code provided
	if (!code) {
		return api.sendMessage("❌ Missing code to execute", threadID, messageID);
	}

	console.log("🔧 Executing code:", code); // Debug log

	let executingMsg = null;
	
	try {
		// Send executing message
		executingMsg = await api.sendMessage("⚙️ Executing...", threadID);
		
		// Setup timeout
		const timeout = new Promise((_, reject) => 
			setTimeout(() => reject(new Error("TIMEOUT")), 10000)
		);
		
		// Setup execution
		const execution = new Promise(async (resolve, reject) => {
			try {
				// Helper functions
				const delay = (ms) => new Promise(res => setTimeout(res, ms));
				const log = console.log;
				
				// Create async function
				const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
				const func = new AsyncFunction(
					'api', 'event', 'threadID', 'messageID', 'args', 'Threads', 'Users', 'Currencies', 'models', 'getText', 'delay', 'log',
					code
				);
				
				// Execute
				const result = await func(
					api, event, threadID, messageID, args, Threads, Users, Currencies, models, getText, delay, log
				);
				
				resolve(result);
			} catch (error) {
				reject(error);
			}
		});
		
		// Race execution vs timeout
		const result = await Promise.race([execution, timeout]);
		
		// Clean up executing message
		if (executingMsg?.messageID) {
			try {
				await api.unsendMessage(executingMsg.messageID);
			} catch (e) {
				console.log("Could not unsend:", e.message);
			}
		}
		
		// Format result
		let output;
		if (result === undefined) {
			output = "✅ Code executed (no return value)";
		} else if (result === null) {
			output = "✅ Result: null";
		} else if (typeof result === "object") {
			if (result instanceof Error) {
				output = `❌ Error: ${result.message}`;
			} else {
				output = `✅ Result: ${JSON.stringify(result, null, 2)}`;
			}
		} else {
			output = `✅ Result: ${String(result)}`;
		}
		
		// Truncate if too long
		if (output.length > 1500) {
			output = output.substring(0, 1400) + "\n... (truncated)";
		}
		
		return api.sendMessage(output, threadID, messageID);
		
	} catch (error) {
		console.log("🚨 Run command error:", error); // Debug log
		
		// Clean up executing message
		if (executingMsg?.messageID) {
			try {
				await api.unsendMessage(executingMsg.messageID);
			} catch (e) {
				console.log("Could not unsend:", e.message);
			}
		}
		
		// Handle specific errors
		if (error.message === "TIMEOUT") {
			return api.sendMessage("⏰ Code execution timed out (10s limit)", threadID, messageID);
		}
		
		let errorMsg = error.message || error.toString() || "Unknown error";
		if (errorMsg.length > 800) {
			errorMsg = errorMsg.substring(0, 750) + "... (truncated)";
		}
		
		return api.sendMessage(`❌ Execution failed:\n${errorMsg}`, threadID, messageID);
	}
};