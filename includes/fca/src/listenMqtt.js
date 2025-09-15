'use strict';

const utils = require('../utils');
const log = require('npmlog');
const mqtt = require('mqtt');
const WebSocket = require('ws');
const HttpsProxyAgent = require('https-proxy-agent');
const EventEmitter = require('events');
const Duplexify = require('duplexify');
const { Transform } = require('stream');

if (!global.mqttEventEmitter) global.mqttEventEmitter = new EventEmitter();

var identity = function() {};
var form = {};
var getSeqID = function() {};
global.Fca.Data.MsgCount = new Map();
global.Fca.Data.event = new Map();

const topics = ['/ls_req','/ls_resp','/legacy_web','/webrtc','/rtc_multi','/onevc','/br_sr','/sr_res','/t_ms','/thread_typing','/orca_typing_notifications','/notify_disconnect','/orca_presence','/inbox','/mercury','/messaging_events','/orca_message_notifications','/pp','/webrtc_response'];

let WebSocket_Global;
let mqttReconnectCount = 0;
const maxReconnectAttempts = 5;
const reconnectBackoff = 2000;

function buildProxy() {
  const Proxy = new Transform({
    objectMode: false,
    transform(chunk, enc, next) {
      if (WebSocket_Global.readyState !== WebSocket_Global.OPEN) return next();
      const data = typeof chunk === 'string' ? Buffer.from(chunk, 'utf8') : chunk;
      WebSocket_Global.send(data);
      next();
    },
    flush(done) {
      WebSocket_Global.close();
      done();
    },
    writev(chunks, cb) {
      const buffers = chunks.map(({ chunk }) => (typeof chunk === 'string' ? Buffer.from(chunk, 'utf8') : chunk));
      this._write(Buffer.concat(buffers), 'binary', cb);
    }
  });
  return Proxy;
}

function buildStream(options, WebSocketIns, Proxy) {
  const Stream = Duplexify(undefined, undefined, options);
  Stream.socket = WebSocketIns;

  let pingInterval;
  let reconnectTimeout;

  const clearTimers = () => {
    clearInterval(pingInterval);
    clearTimeout(reconnectTimeout);
  };

  WebSocketIns.onclose = () => {
    clearTimers();
    Stream.end();
    Stream.destroy();
  };

  WebSocketIns.onerror = (err) => {
    clearTimers();
    Stream.destroy(err);
  };

  WebSocketIns.onmessage = (event) => {
    clearTimeout(reconnectTimeout);
    const data = event.data instanceof ArrayBuffer ? Buffer.from(event.data) : Buffer.from(event.data, 'utf8');
    Stream.push(data);
  };

  WebSocketIns.onopen = () => {
    Stream.setReadable(Proxy);
    Stream.setWritable(Proxy);
    Stream.emit('connect');
    pingInterval = setInterval(() => {
      if (WebSocketIns.readyState === WebSocketIns.OPEN && WebSocketIns.ping) WebSocketIns.ping();
    }, 30000);
    reconnectTimeout = setTimeout(() => {
      if (WebSocketIns.readyState === WebSocketIns.OPEN) {
        WebSocketIns.close();
        Stream.end();
        Stream.destroy();
      }
    }, 60000);
  };

  WebSocket_Global = WebSocketIns;
  Proxy.on('close', () => {
    clearTimers();
    WebSocketIns.close();
  });

  return Stream;
}

function listenMqtt(defaultFuncs, api, ctx, globalCallback) {
  const chatOn = ctx.globalOptions.online;
  const foreground = false;
  const sessionID = Math.floor(Math.random() * Number.MAX_SAFE_INTEGER) + 1;
  const GUID = utils.getGUID();
  const username = {
    u: ctx.userID, s: sessionID, chat_on: chatOn, fg: foreground, d: GUID, ct: 'websocket',
    aid: '219994525426954', aids: null, mqtt_sid: '', cp: 3, ecp: 10, st: [], pm: [], dc: '',
    no_auto_fg: true, gas: null, pack: [], p: null, php_override: ""
  };

  const cookies = ctx.jar.getCookies('https://www.facebook.com').join('; ');
  let host;
  if (ctx.mqttEndpoint) host = `${ctx.mqttEndpoint}&sid=${sessionID}&cid=${GUID}`;
  else if (ctx.region) host = `wss://edge-chat.facebook.com/chat?region=${ctx.region.toLowerCase()}&sid=${sessionID}&cid=${GUID}`;
  else host = `wss://edge-chat.facebook.com/chat?sid=${sessionID}&cid=${GUID}`;

  const options = {
    clientId: 'mqttwsclient',
    protocolId: 'MQIsdp',
    protocolVersion: 3,
    username: JSON.stringify(username),
    clean: true,
    wsOptions: {
      headers: {
        Cookie: cookies,
        Origin: 'https://www.facebook.com',
        'User-Agent': ctx.globalOptions.userAgent || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/101.0.4951.64 Safari/537.36',
        Referer: 'https://www.facebook.com/',
        Host: new URL(host).hostname
      },
      origin: 'https://www.facebook.com',
      protocolVersion: 13,
      binaryType: 'arraybuffer'
    },
    keepalive: 60,
    reschedulePings: true,
    reconnectPeriod: 2000,
    connectTimeout: 10000
  };

  if (ctx.globalOptions.proxy !== undefined) {
    const agent = new HttpsProxyAgent(ctx.globalOptions.proxy);
    options.wsOptions.agent = agent;
  }

  ctx.mqttClient = new mqtt.Client(() => buildStream(options, new WebSocket(host, options.wsOptions), buildProxy()), options);
  global.mqttClient = ctx.mqttClient;

  global.mqttClient.on('error', async () => {
    log.error(' Appstate không còn khả dụng');
    global.mqttClient.end();
    if (global.config && global.config.autoLogin && global.config.autoLogin.enabled) {
      try {
        const { handleRelogin } = require('../../login/loginandby.js');
        const loginResult = await handleRelogin();
        if (loginResult) process.exit(1);
        else {
          console.log('❌ AutoLogin thất bại');
          process.exit(1);
        }
      } catch (autoLoginError) {
        console.log('❌ AutoLogin gặp lỗi:', autoLoginError.message);
        process.exit(1);
      }
    } else {
      if (mqttReconnectCount < maxReconnectAttempts) {
        mqttReconnectCount++;
        const backoffTime = reconnectBackoff * Math.pow(2, mqttReconnectCount - 1);
        setTimeout(() => {
          if (ctx.globalOptions.autoReconnect) getSeqID();
        }, backoffTime);
      } else {
        globalCallback({ type: 'stop_listen', error: 'Server Đã Sập - Auto Restart' }, null);
        process.exit(1);
      }
    }
  });

  global.mqttClient.on('connect', () => {
    mqttReconnectCount = 0;

    if (!global.Fca.Data.Setup) {
      if (global.Fca.Require.FastConfig.RestartMQTT_Minutes !== 0 && global.Fca.Data.StopListening !== true) {
        global.Fca.Data.Setup = true;
        setTimeout(() => {
          global.Fca.Require.logger.Warning('Closing MQTT Client...');
          ctx.mqttClient.end();
          global.Fca.Require.logger.Warning('Reconnecting MQTT Client...');
          global.Fca.Data.Setup = false;
          getSeqID();
        }, Number(global.Fca.Require.FastConfig.RestartMQTT_Minutes) * 60 * 1000);
      }
    }

    if (process.env.OnStatus === undefined) {
      global.Fca.Require.logger.Normal('Horizon Prime');
      const MemoryManager = require('../Extra/Src/Release_Memory');
      const path = require('path');
      const SettingMemoryManager = {
        warningThreshold: 0.7, releaseThreshold: 0.8, maxThreshold: 0.9, interval: 60 * 1000,
        logLevel: 'warn', logFile: path.join(process.cwd(), 'Horizon_Database', 'memory.log'),
        smartReleaseEnabled: true, allowLog: (global.Fca.Require.FastConfig.AntiStuckAndMemoryLeak.LogFile.Use || false)
      };
      const memoryManager = new MemoryManager(SettingMemoryManager);
      memoryManager.autoStart(60 * 60 * 1000);
      if (global.Fca.Require.FastConfig.AntiStuckAndMemoryLeak.AutoRestart.Use) {
        memoryManager.onMaxMemory(function() {
          global.Fca.Require.logger.Warning('Memory Usage >= 90% - Auto Restart Avoid Crash');
          process.exit(1);
        });
      }
      process.env.OnStatus = true;
    }

    topics.forEach((topicsub) => global.mqttClient.subscribe(topicsub));

    const queue = {
      sync_api_version: 11, max_deltas_able_to_process: 100, delta_batch_size: 500, encoding: 'JSON',
      entity_fbid: ctx.userID, initial_titan_sequence_id: ctx.lastSeqId, device_params: null
    };
    global.mqttClient.publish("/messenger_sync_create_queue", JSON.stringify(queue), { qos: 1, retain: false });

    var rTimeout = setTimeout(function() {
      global.mqttClient.end();
      getSeqID();
    }, 3000);

    ctx.tmsWait = function() {
      clearTimeout(rTimeout);
      ctx.globalOptions.emitReady ? globalCallback({ type: "ready", error: null }) : '';
      delete ctx.tmsWait;
    };
  });

  global.mqttClient.on('message', (topic, message) => {
    const jsonMessage = JSON.parse(message.toString());
    if (topic === "/t_ms") {
      if (ctx.tmsWait && typeof ctx.tmsWait == "function") ctx.tmsWait();
      if (jsonMessage.firstDeltaSeqId && jsonMessage.syncToken) {
        ctx.lastSeqId = jsonMessage.firstDeltaSeqId;
        ctx.syncToken = jsonMessage.syncToken;
      }
      if (jsonMessage.lastIssuedSeqId) ctx.lastSeqId = parseInt(jsonMessage.lastIssuedSeqId);
      for (var i in jsonMessage.deltas) {
        var delta = jsonMessage.deltas[i];
        parseDelta(defaultFuncs, api, ctx, globalCallback, { delta });
      }
    } else if (topic === '/thread_typing' || topic === '/orca_typing_notifications') {
      var typ = {
        type: "typ",
        isTyping: !!jsonMessage.state,
        from: jsonMessage.sender_fbid.toString(),
        threadID: utils.formatID((jsonMessage.thread || jsonMessage.sender_fbid).toString())
      };
      globalCallback(null, typ);
    } else if (topic === '/orca_presence' && !ctx.globalOptions.updatePresence) {
      for (var i in jsonMessage.list) {
        var data = jsonMessage.list[i];
        var userID = data["u"];
        var presence = { type: "presence", userID: userID.toString(), timestamp: data["l"] * 1000, statuses: data["p"] };
        globalCallback(null, presence);
      }
    }
  });
}

function parseDelta(defaultFuncs, api, ctx, globalCallback, { delta }) {
  if (delta.class === 'NewMessage') {
    if (ctx.globalOptions.pageID && ctx.globalOptions.pageID !== delta.queue) return;

    const resolveAttachmentUrl = (i) => {
      if (!delta.attachments || i === delta.attachments.length || utils.getType(delta.attachments) !== 'Array') {
        let fmtMsg;
        try { fmtMsg = utils.formatDeltaMessage(delta); } catch { return; }
        if (fmtMsg) {
          const isGroup = fmtMsg.isGroup;
          const threadID = fmtMsg.threadID;
          const messageID = fmtMsg.messageID;
          global.Fca.Data.event.set("Data", { isGroup, threadID, messageID });
          if (global.Fca.Require.FastConfig.AntiGetInfo.AntiGetThreadInfo) global.Fca.Data.MsgCount.set(fmtMsg.threadID, ((global.Fca.Data.MsgCount.get(fmtMsg.threadID)) + 1 || 1));
          if (ctx.globalOptions.autoMarkDelivery) markDelivery(ctx, api, fmtMsg.threadID, fmtMsg.messageID);
          if (!ctx.globalOptions.selfListen && fmtMsg.senderID === ctx.userID) return;
          globalCallback(null, fmtMsg);
        }
      } else {
        const attachment = delta.attachments[i];
        if (attachment.mercury.attach_type === 'photo') {
          api.resolvePhotoUrl(attachment.fbid, (err, url) => {
            if (!err) attachment.mercury.metadata.url = url;
            resolveAttachmentUrl(i + 1);
          });
        } else {
          resolveAttachmentUrl(i + 1);
        }
      }
    };

    resolveAttachmentUrl(0);
  } else if (delta.class === 'ClientPayload') {
    const clientPayload = utils.decodeClientPayload(delta.payload);
    if (clientPayload && clientPayload.deltas) {
      for (const d of clientPayload.deltas) {
        if (d.deltaThreadEmojiChange) {
          const emojiChange = {
            type: 'emoji_change',
            threadID: (d.deltaThreadEmojiChange.threadKey.threadFbId ? d.deltaThreadEmojiChange.threadKey.threadFbId : d.deltaThreadEmojiChange.threadKey.otherUserFbId).toString(),
            author: d.deltaThreadEmojiChange.actorId.toString(),
            oldEmoji: d.deltaThreadEmojiChange.oldEmoji,
            newEmoji: d.deltaThreadEmojiChange.newEmoji,
            timestamp: Date.now()
          };
          if (global.mqttEventEmitter) global.mqttEventEmitter.emit('emoji_change', emojiChange);
          globalCallback(null, emojiChange);
        } else if (d.deltaMessageReaction && !!ctx.globalOptions.listenEvents) {
          const messageReaction = {
            type: 'message_reaction',
            threadID: (d.deltaMessageReaction.threadKey.threadFbId ? d.deltaMessageReaction.threadKey.threadFbId : d.deltaMessageReaction.threadKey.otherUserFbId).toString(),
            messageID: d.deltaMessageReaction.messageId,
            reaction: d.deltaMessageReaction.reaction,
            senderID: d.deltaMessageReaction.senderId.toString(),
            userID: d.deltaMessageReaction.userId.toString()
          };
          globalCallback(null, messageReaction);
        } else if (d.deltaRecallMessageData && !!ctx.globalOptions.listenEvents) {
          const messageUnsend = {
            type: 'message_unsend',
            threadID: (d.deltaRecallMessageData.threadKey.threadFbId ? d.deltaRecallMessageData.threadKey.threadFbId : d.deltaRecallMessageData.threadKey.otherUserFbId).toString(),
            messageID: d.deltaRecallMessageData.messageID,
            senderID: d.deltaRecallMessageData.senderID.toString(),
            deletionTimestamp: d.deltaRecallMessageData.deletionTimestamp,
            timestamp: d.deltaRecallMessageData.timestamp
          };
          globalCallback(null, messageUnsend);
        } else if (d.deltaMessageReply) {
          const mdata = d.deltaMessageReply.message?.data?.prng ? JSON.parse(d.deltaMessageReply.message.data.prng) : [];
          const m_id = mdata.map((u) => u.i);
          const m_offset = mdata.map((u) => u.o);
          const m_length = mdata.map((u) => u.l);
          const mentions = {};
          for (let i = 0; i < m_id.length; i++) mentions[m_id[i]] = (d.deltaMessageReply.message.body || '').substring(m_offset[i], m_offset[i] + m_length[i]);

          const callbackToReturn = {
            type: 'message_reply',
            threadID: (d.deltaMessageReply.message.messageMetadata.threadKey.threadFbId ? d.deltaMessageReply.message.messageMetadata.threadKey.threadFbId : d.deltaMessageReply.message.messageMetadata.threadKey.otherUserFbId).toString(),
            messageID: d.deltaMessageReply.message.messageMetadata.messageId,
            senderID: d.deltaMessageReply.message.messageMetadata.actorFbId.toString(),
            attachments: (d.deltaMessageReply.message.attachments || [])
              .map((att) => { const mercury = JSON.parse(att.mercuryJSON); Object.assign(att, mercury); return att; })
              .map((att) => { try { return utils._formatAttachment(att); } catch (ex) { att.error = ex; att.type = 'unknown'; return att; } }),
            args: (d.deltaMessageReply.message.body || '').trim().split(/\s+/),
            body: d.deltaMessageReply.message.body || '',
            isGroup: !!d.deltaMessageReply.message.messageMetadata.threadKey.threadFbId,
            mentions,
            timestamp: parseInt(d.deltaMessageReply.message.messageMetadata.timestamp),
            participantIDs: (d.deltaMessageReply.message.participants || []).map((e) => e.toString())
          };

          if (d.deltaMessageReply.repliedToMessage) {
            const mdata2 = d.deltaMessageReply.repliedToMessage?.data?.prng ? JSON.parse(d.deltaMessageReply.repliedToMessage.data.prng) : [];
            const m_id2 = mdata2.map((u) => u.i);
            const m_offset2 = mdata2.map((u) => u.o);
            const m_length2 = mdata2.map((u) => u.l);
            const rmentions = {};
            for (let i = 0; i < m_id2.length; i++) rmentions[m_id2[i]] = (d.deltaMessageReply.repliedToMessage.body || '').substring(m_offset2[i], m_offset2[i] + m_length2[i]);

            callbackToReturn.messageReply = {
              type: 'Message',
              threadID: callbackToReturn.threadID,
              messageID: d.deltaMessageReply.repliedToMessage.messageMetadata.messageId,
              senderID: d.deltaMessageReply.repliedToMessage.messageMetadata.actorFbId.toString(),
              attachments: d.deltaMessageReply.repliedToMessage.attachments
                .map((att) => { const mercury = JSON.parse(att.mercuryJSON); Object.assign(att, mercury); return att; })
                .map((att) => { try { return utils._formatAttachment(att); } catch (ex) { att.error = ex; att.type = 'unknown'; return att; } }),
              args: (d.deltaMessageReply.repliedToMessage.body || '').trim().split(/\s+/),
              body: d.deltaMessageReply.repliedToMessage.body || '',
              isGroup: !!d.deltaMessageReply.repliedToMessage.messageMetadata.threadKey.threadFbId,
              mentions: rmentions,
              timestamp: parseInt(d.deltaMessageReply.repliedToMessage.messageMetadata.timestamp),
              participantIDs: (d.deltaMessageReply.repliedToMessage.participants || []).map((e) => e.toString())
            };
          } else if (d.deltaMessageReply.replyToMessageId) {
            return defaultFuncs
              .post('https://www.facebook.com/api/graphqlbatch/', ctx.jar, {
                av: ctx.globalOptions.pageID,
                queries: JSON.stringify({
                  o0: { doc_id: '2848441488556444', query_params: { thread_and_message_id: { thread_id: callbackToReturn.threadID, message_id: d.deltaMessageReply.replyToMessageId.id } } }
                })
              })
              .then(utils.parseAndCheckLogin(ctx, defaultFuncs))
              .then((resData) => {
                if (resData[resData.length - 1].error_results > 0) throw resData[0].o0.errors;
                if (resData[resData.length - 1].successful_results === 0) throw { error: 'forcedFetch: there was no successful_results', res: resData };
                const fetchData = resData[0].o0.data.message;
                const mobj = {};
                for (const n in fetchData.message.ranges) {
                  mobj[fetchData.message.ranges[n].entity.id] = (fetchData.message.text || '').substr(fetchData.message.ranges[n].offset, fetchData.message.ranges[n].length);
                }
                callbackToReturn.messageReply = {
                  type: 'Message',
                  threadID: callbackToReturn.threadID,
                  messageID: fetchData.message_id,
                  senderID: fetchData.message_sender.id.toString(),
                  attachments: fetchData.message.blob_attachment.map((att) => utils._formatAttachment({ blob_attachment: att })),
                  args: (fetchData.message.text || '').trim().split(/\s+/) || [],
                  body: fetchData.message.text || '',
                  isGroup: callbackToReturn.isGroup,
                  mentions: mobj,
                  timestamp: parseInt(fetchData.timestamp_precise)
                };
              })
              .catch((err) => log.error('forcedFetch', err))
              .finally(() => {
                if (ctx.globalOptions.autoMarkDelivery) markDelivery(ctx, api, callbackToReturn.threadID, callbackToReturn.messageID);
                if (!ctx.globalOptions.selfListen && callbackToReturn.senderID === ctx.userID) return;
                globalCallback(null, callbackToReturn);
              });
          } else {
            callbackToReturn.delta = d;
          }
          if (ctx.globalOptions.autoMarkDelivery) markDelivery(ctx, api, callbackToReturn.threadID, callbackToReturn.messageID);
          if (!ctx.globalOptions.selfListen && callbackToReturn.senderID === ctx.userID) return;
          globalCallback(null, callbackToReturn);
        }
      }
      return;
    }
  }

  switch (delta.class) {
    case 'ReadReceipt': {
      let fmtMsg; try { fmtMsg = utils.formatDeltaReadReceipt(delta); } catch { return; }
      globalCallback(null, fmtMsg);
      break;
    }
    case 'AdminTextMessage': {
      switch (delta.type) {
        case 'joinable_group_link_mode_change':
        case 'magic_words':
        case 'pin_messages_v2':
        case 'change_thread_theme':
        case 'change_thread_icon':
        case 'change_thread_quick_reaction':
        case 'change_thread_nickname':
        case 'change_thread_admins':
        case 'change_thread_approval_mode':
        case 'group_poll':
        case 'messenger_call_log':
        case 'participant_joined_group_call': {
          let fmtMsg; try { fmtMsg = utils.formatDeltaEvent(delta); } catch { return; }
          const isEmojiChange = (
            (delta.type === 'change_thread_icon') ||
            (delta.type === 'change_thread_quick_reaction') ||
            (fmtMsg.logMessageData && (fmtMsg.logMessageData.thread_emoji || fmtMsg.logMessageData.emoji || fmtMsg.logMessageData.thread_quick_reaction_emoji))
          );
          if (isEmojiChange && global.eventModules && global.eventModules.logemoji) {
            try { global.eventModules.logemoji.handleEmojiChange(fmtMsg); } catch (err) { console.error('❌ Lỗi khi gọi logemoji:', err); }
          }
          globalCallback(null, fmtMsg);
          break;
        }
      }
      break;
    }
    case 'ForcedFetch': {
      if (!delta.threadKey) return;
      const mid = delta.messageId;
      const tid = delta.threadKey.threadFbId;
      if (mid && tid) {
        const formFF = {
          av: ctx.globalOptions.pageID,
          queries: JSON.stringify({
            o0: { doc_id: '2848441488556444', query_params: { thread_and_message_id: { thread_id: tid.toString(), message_id: mid } } }
          })
        };
        defaultFuncs
          .post('https://www.facebook.com/api/graphqlbatch/', ctx.jar, formFF)
          .then(utils.parseAndCheckLogin(ctx, defaultFuncs))
          .then((resData) => {
            if (resData[resData.length - 1].error_results > 0) throw resData[0].o0.errors;
            if (resData[resData.length - 1].successful_results === 0) throw { error: 'forcedFetch: there was no successful_results', res: resData };
            const fetchData = resData[0].o0.data.message;
            if (utils.getType(fetchData) === 'Object') {
              switch (fetchData.__typename) {
                case 'ThreadImageMessage': {
                  if (!ctx.globalOptions.selfListen && fetchData.message_sender.id.toString() === ctx.userID) return;
                  if (!ctx.loggedIn) return;
                  const imageChangeEvent = {
                    type: 'change_thread_image',
                    logMessageType: 'log:thread-image',
                    threadID: utils.formatID(tid.toString()),
                    snippet: fetchData.snippet,
                    timestamp: fetchData.timestamp_precise,
                    author: fetchData.message_sender.id,
                    messageID: fetchData.message_id,
                    logMessageData: {
                      image_data: {
                        attachmentID: fetchData.image_with_metadata && fetchData.image_with_metadata.legacy_attachment_id,
                        width: fetchData.image_with_metadata && fetchData.image_with_metadata.original_dimensions.x,
                        height: fetchData.image_with_metadata && fetchData.image_with_metadata.original_dimensions.y,
                        url: fetchData.image_with_metadata && fetchData.image_with_metadata.preview.uri
                      },
                      changed_by: fetchData.message_sender.id,
                      change_time: fetchData.timestamp_precise,
                      thread_id: tid.toString()
                    },
                    image: {
                      attachmentID: fetchData.image_with_metadata && fetchData.image_with_metadata.legacy_attachment_id,
                      width: fetchData.image_with_metadata && fetchData.image_with_metadata.original_dimensions.x,
                      height: fetchData.image_with_metadata && fetchData.image_with_metadata.original_dimensions.y,
                      url: fetchData.image_with_metadata && fetchData.image_with_metadata.preview.uri
                    }
                  };
                  if (global.mqttEventEmitter) {
                    global.mqttEventEmitter.emit('thread_image_change', imageChangeEvent);
                    global.mqttEventEmitter.emit('mqtt_event', { type: 'thread_image_change', data: imageChangeEvent });
                  }
                  globalCallback(null, imageChangeEvent);
                  break;
                }
                case 'UserMessage': {
                  const ev = {
                    type: 'message',
                    senderID: utils.formatID(fetchData.message_sender.id),
                    body: fetchData.message.text || '',
                    threadID: utils.formatID(tid.toString()),
                    messageID: fetchData.message_id,
                    attachments: [{
                      type: 'share',
                      ID: fetchData.extensible_attachment.legacy_attachment_id,
                      url: fetchData.extensible_attachment.story_attachment.url,
                      title: fetchData.extensible_attachment.story_attachment.title_with_entities.text,
                      description: fetchData.extensible_attachment.story_attachment.description.text,
                      source: fetchData.extensible_attachment.story_attachment.source,
                      image: ((fetchData.extensible_attachment.story_attachment.media || {}).image || {}).uri,
                      width: ((fetchData.extensible_attachment.story_attachment.media || {}).image || {}).width,
                      height: ((fetchData.extensible_attachment.story_attachment.media || {}).image || {}).height,
                      playable: (fetchData.extensible_attachment.story_attachment.media || {}).is_playable || false,
                      duration: (fetchData.extensible_attachment.story_attachment.media || {}).playable_duration_in_ms || 0,
                      subattachments: fetchData.extensible_attachment.subattachments,
                      properties: fetchData.extensible_attachment.story_attachment.properties
                    }],
                    mentions: {},
                    timestamp: parseInt(fetchData.timestamp_precise),
                    isGroup: (fetchData.message_sender.id !== tid.toString())
                  };
                  log.info('ff-Return', ev);
                  globalCallback(null, ev);
                  break;
                }
                default: log.error('forcedFetch', fetchData);
              }
            } else log.error('forcedFetch', fetchData);
          })
          .catch((err) => log.error('forcedFetch', err));
      }
      break;
    }
    case 'ThreadName':
    case 'ParticipantsAddedToGroupThread':
    case 'ParticipantLeftGroupThread': {
      let formattedEvent;
      try { formattedEvent = utils.formatDeltaEvent(delta); } catch { return; }
      if (!ctx.globalOptions.selfListen && formattedEvent.author.toString() === ctx.userID) return;
      if (!ctx.loggedIn) return;
      globalCallback(null, formattedEvent);
      break;
    }
    case 'NewMessage': {
      const hasLiveLocation = d => {
        const attachment = d.attachments?.[0]?.mercury?.extensible_attachment;
        const storyAttachment = attachment?.story_attachment;
        return storyAttachment?.style_list?.includes('message_live_location');
      };
      if (delta.attachments?.length === 1 && hasLiveLocation(delta)) {
        delta.class = 'UserLocation';
        try { const fmtMsg = utils.formatDeltaEvent(delta); globalCallback(null, fmtMsg); } catch { return; }
      }
      break;
    }
  }
}

function markDelivery(ctx, api, threadID, messageID) {
  if (threadID && messageID) {
    api.markAsDelivered(threadID, messageID, (err) => {
      if (err) log.error('markAsDelivered', err);
      else if (ctx.globalOptions.autoMarkRead) {
        api.markAsRead(threadID, (err2) => { if (err2) log.error('markAsDelivered', err2); });
      }
    });
  }
}

function getRespData(Type, payload) {
  try {
    switch (Type) {
      case "sendMqttMessage":
        return { type: Type, threadID: payload.step[1][2][2][1][2], messageID: payload.step[1][2][2][1][3], payload: payload.step[1][2] };
      default:
        return { Data: payload.step[1][2][2][1], type: Type, payload: payload.step[1][2] };
    }
  } catch { return null; }
}

function LogUptime() {
  const uptime = process.uptime();
  const { join } = require('path');
  const filePath = join(__dirname, '../CountTime.json');
  let time1;
  if (global.Fca.Require.fs.existsSync(filePath)) time1 = Number(global.Fca.Require.fs.readFileSync(filePath, 'utf8')) || 0;
  else time1 = 0;
  global.Fca.Require.fs.writeFileSync(filePath, String(Number(uptime) + time1), 'utf8');
}

if (global.Fca.Require.FastConfig.AntiGetInfo.AntiGetThreadInfo) {
  setInterval(() => {
    try {
      const { updateMessageCount, getData, hasData } = require('../Extra/ExtraGetThread');
      const Data = global.Fca.Data.MsgCount;
      const Arr = Array.from(Data.keys());
      for (let i of Arr) {
        const Count = parseInt(Data.get(i));
        if (hasData(i)) {
          let x = getData(i);
          x.messageCount += Count;
          updateMessageCount(i, x);
          Data.delete(i);
        }
      }
    } catch (e) { console.log(e); }
  }, 30 * 1000);
}

module.exports = function(defaultFuncs, api, ctx) {
  var globalCallback = identity;

  getSeqID = function() {
    ctx.t_mqttCalled = false;
    defaultFuncs
      .post("https://www.facebook.com/api/graphqlbatch/", ctx.jar, form)
      .then(utils.parseAndCheckLogin(ctx, defaultFuncs))
      .then((resData) => {
        if (utils.getType(resData) != "Array") {
          if (global.config && global.config.autoLogin && global.config.autoLogin.enabled) {
            global.Fca.Require.logger.Warning("AutoLogin được kích hoạt");
            global.Fca.Require.logger.Warning("AppState lỗi trong MQTT - Khởi động lại để kích hoạt AutoLogin...");
            process.exit(1);
          } else {
            return global.Fca.Require.logger.Error(global.Fca.Require.Language.Index.ErrAppState);
          }
        } else {
          if (resData && resData[resData.length - 1].error_results > 0) throw resData[0].o0.errors;
          if (resData[resData.length - 1].successful_results === 0) throw { error: "getSeqId: there was no successful_results", res: resData };
          if (resData[0].o0.data.viewer.message_threads.sync_sequence_id) {
            ctx.lastSeqId = resData[0].o0.data.viewer.message_threads.sync_sequence_id;
            listenMqtt(defaultFuncs, api, ctx, globalCallback);
          } else throw { error: "getSeqId: no sync_sequence_id found.", res: resData };
        }
      })
      .catch((err) => {
        log.error("getSeqId", err);
        if (utils.getType(err) == "Object" && err.error === "getSeqId: no sync_sequence_id found.") ctx.loggedIn = false;
        return globalCallback(err);
      });
  };

  return function(callback) {
    class MessageEmitter extends EventEmitter {
      stopListening(cb) {
        cb = cb || (() => {});
        globalCallback = identity;
        if (ctx.mqttClient) {
          ctx.mqttClient.unsubscribe("/webrtc");
          ctx.mqttClient.unsubscribe("/rtc_multi");
          ctx.mqttClient.unsubscribe("/onevc");
          ctx.mqttClient.publish("/browser_close", "{}");
          ctx.mqttClient.end(false, function(...data) {
            ctx.mqttClient = undefined;
            cb(data);
          });
        }
        global.Fca.Data.StopListening = true;
      }
    }

    var msgEmitter = new MessageEmitter();
    globalCallback = (callback || function(error, message) {
      if (error) return msgEmitter.emit("error", error);
      msgEmitter.emit("message", message);
    });

    if (!ctx.firstListen) ctx.lastSeqId = null;
    ctx.syncToken = undefined;
    ctx.t_mqttCalled = false;

    form = {
      av: ctx.globalOptions.pageID,
      queries: JSON.stringify({
        o0: {
          doc_id: '3336396659757871',
          query_params: { limit: 1, before: null, tags: ['INBOX'], includeDeliveryReceipts: false, includeSeqID: true }
        }
      })
    };

    if (!ctx.firstListen || !ctx.lastSeqId) getSeqID();
    else listenMqtt(defaultFuncs, api, ctx, globalCallback);
    ctx.firstListen = false;

    return msgEmitter;
  };
};

process.on('SIGINT', () => {
  if (global.mqttClient) global.mqttClient.end();
  LogUptime();
  process.exit();
});

process.on('exit', LogUptime);