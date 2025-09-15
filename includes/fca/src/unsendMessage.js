"use strict";

var utils = require("../utils");

module.exports = function(defaultFuncs, api, ctx) {
  return async function unsendMessage(messageID, callback) {
    var resolveFunc = function(){};
    var rejectFunc = function(){};
    var returnPromise = new Promise(function(resolve, reject) {
      resolveFunc = resolve;
      rejectFunc = reject;
    });

    if (!callback) {
      callback = function(err) {
        if (err) return rejectFunc(err);
        resolveFunc();
      };
    }

    const unsendMethods = {
      async graphql() {
        try {
          const form = {
            message_id: messageID,
            client_mutation_id: messageID
          };

          const res = await defaultFuncs
            .post("https://www.facebook.com/messaging/unsend_message/", ctx.jar, form)
            .then(utils.parseAndCheckLogin(ctx, defaultFuncs));

          if (res.error) throw res;
          return true;
        } catch (error) {
          return false;
        }
      },

      async messenger() {
        try {
          const form = {
            message_id: messageID,
            source: "source:messenger:web"
          };

          const res = await defaultFuncs
            .post("https://www.messenger.com/messaging/unsend_message/", ctx.jar, form)
            .then(utils.parseAndCheckLogin(ctx, defaultFuncs));

          if (res.error) throw res;
          return true;
        } catch (error) {
          return false;
        }
      },

      async legacy() {
        try {
          const form = {
            message_id: messageID,
            action_type: "unsend_message",
            is_async: true
          };

          const res = await defaultFuncs
            .post("https://www.facebook.com/ajax/mercury/delete_messages.php", ctx.jar, form)
            .then(utils.parseAndCheckLogin(ctx, defaultFuncs));

          if (res.error) throw res;
          return true;
        } catch (error) {
          return false;
        }
      },

      async mobile() {
        try {
          const form = {
            message_id: messageID
          };

          const res = await defaultFuncs
            .post("https://m.facebook.com/messages/unsend_message/", ctx.jar, form)
            .then(utils.parseAndCheckLogin(ctx, defaultFuncs));

          if (res.error) throw res;
          return true;
        } catch (error) {
          return false;
        }
      }
    };

    try {
      if (await unsendMethods.graphql()) {
        return callback();
      }

      if (await unsendMethods.messenger()) {
        return callback();
      }

      if (await unsendMethods.legacy()) {
        return callback();
      }

      if (await unsendMethods.mobile()) {
        return callback();
      }

      throw {error: "Không thể gỡ tin nhắn bằng bất kỳ phương thức nào"};

    } catch (err) {
      return callback(err);
    }

    return returnPromise;
  };
};