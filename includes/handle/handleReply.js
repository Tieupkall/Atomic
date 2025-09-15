module.exports = function ({ api, models, Users, Threads, Currencies }) {
    return function ({ event }) {
        const { events } = global.client;
        if (events && events.size > 0) {
            for (const [eventName, eventData] of events.entries()) {
                if (eventData && eventData.config && eventData.config.eventType) {
                    const eventTypes = eventData.config.eventType;
                    if (eventTypes.includes("message_reply") || eventTypes.includes("message")) {
                        try {
                            eventData.run({ api, event, models, Users, Threads, Currencies });
                        } catch (error) {
                            console.error(`[HANDLE REPLY] Error in event ${eventName}:`, error);
                        }
                    }
                }
            }
        }

        if (!event.messageReply) return;

        const { handleReply, commands } = global.client;
        const { messageID, threadID, messageReply, senderID, body } = event;
        if (handleReply.length !== 0) {
            const indexOfHandle = handleReply.findIndex(e => e.messageID == messageReply.messageID);
            if (indexOfHandle < 0) {
                return;
            }
            const indexOfMessage = handleReply[indexOfHandle];

            

            // Xử lý handleReply thông thường
            const handleNeedExec = commands.get(indexOfMessage.name);
            if (!handleNeedExec) return api.sendMessage(global.getText("handleCommand", "missingValue"), threadID, messageID);
            try {
                var getText2;
                if (handleNeedExec.languages && typeof handleNeedExec.languages == 'object')
                    getText2 = (...value) => {
                        const reply = handleNeedExec.languages || {};
                        if (!reply.hasOwnProperty(global.config.language))
                            return api.sendMessage(global.getText('handleCommand', 'notFoundLanguage', handleNeedExec.config.name), threadID, messengeID);
                        var lang = handleNeedExec.languages[global.config.language][value[0]] || '';
                        for (var i = value.length; i > -0x4 * 0x4db + 0x6d * 0x55 + -0x597 * 0x3; i--) {
                            const expReg = RegExp('%' + i, 'g');
                            lang = lang.replace(expReg, value[i]);
                        }
                        return lang;
                    };
                else getText2 = () => { };
                const Obj = {};
                Obj.api = api;
                Obj.event = event;
                Obj.models = models;
                Obj.Users = Users;
                Obj.Threads = Threads;
                Obj.Currencies = Currencies;
                Obj.handleReply = indexOfMessage;
                Obj.models = models;
                Obj.getText = getText2;
                handleNeedExec.handleReply(Obj);
                return;
            }
            catch (error) {
                return api.sendMessage(global.getText("handleCommand", "executeCommand", error), threadID, messageID);
            }
        }
    };
}