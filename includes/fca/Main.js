'use strict';

if (global.Fca.Require.FastConfig.Config != 'default') {

}
const { execSync } = require('child_process');
const Language = global.Fca.Require.languageFile.find((i) => i.Language == global.Fca.Require.FastConfig.Language).Folder.Index;

var utils = global.Fca.Require.utils,
    logger = global.Fca.Require.logger,
    fs = global.Fca.Require.fs,
    getText = global.Fca.getText,
    log = global.Fca.Require.log,
    cheerio = require("cheerio"),
    { writeFileSync } = require('fs-extra'),
    Database = require("./Extra/Database"),
    readline = require("readline"),
    chalk = require("chalk"),
    figlet = require("figlet"),
    os = require("os"),
    deasync = require('deasync'),
    Security = require("./Extra/Security/Base"),
    { getAll, deleteAll } = require('./Extra/ExtraGetThread'),
    ws = require('ws'),
    Websocket = require('./Extra/Src/Websocket'),
    Convert = require('ansi-to-html');

log.maxRecordSize = 100;
var checkVerified = null;
const Boolean_Option = ['online','selfListen','listenEvents','updatePresence','forceLogin','autoMarkDelivery','autoMarkRead','listenTyping','autoReconnect','emitReady'];


function setOptions(globalOptions, options) {
    Object.keys(options).map(function(key) {
        switch (Boolean_Option.includes(key)) {
            case true: {
                globalOptions[key] = Boolean(options[key]);
                break;
            }
            case false: {
                switch (key) {
                    case 'pauseLog': {
                        if (options.pauseLog) log.pause();
                            else log.resume();
                        break;
                    }
                    case 'logLevel': {
                        log.level = options.logLevel;
                            globalOptions.logLevel = options.logLevel;
                        break;
                    }
                    case 'logRecordSize': {
                        log.maxRecordSize = options.logRecordSize;
                            globalOptions.logRecordSize = options.logRecordSize;
                        break;
                    }
                    case 'pageID': {
                        globalOptions.pageID = options.pageID.toString();
                        break;
                    }
                    case 'userAgent': {
                        globalOptions.userAgent = (options.userAgent || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
                        break;
                    }
                    case 'proxy': {
                        if (typeof options.proxy != "string") {
                            delete globalOptions.proxy;
                            utils.setProxy();
                        } else {
                            globalOptions.proxy = options.proxy;
                            utils.setProxy(globalOptions.proxy);
                        }
                        break;
                    }
                    default: {
                        log.warn("setOptions", "Unrecognized option given to setOptions: " + key);
                        break;
                    }
                }
                break;
            }
        }
    });
}

function buildAPI(globalOptions, html, jar) {
    let fb_dtsg = null;
    let irisSeqID = null;

    function getFBDTSG(html) {
        let match = html.match(/\["DTSGInitialData",\[\],{"token":"([^"]+)"}/);
        if (match) {
            return match[1].replace(/\\/g, '');
        }
        match = html.match(/{"token":"([^"]+)","async_get_token"/);
        if (match) {
            logger.Normal("Found fb_dtsg in async_get_token pattern");
            return match[1];
        }
        match = html.match(/<input type="hidden" name="fb_dtsg" value="([^"]+)"/);
        if (match) {
            logger.Normal("Found fb_dtsg in input field pattern");
            return match[1];
        }

        logger.Warning("Could not find fb_dtsg in any pattern");
        return null;
    }

    fb_dtsg = getFBDTSG(html);
    irisSeqID = (html.match(/irisSeqID":"([^"]+)"/) || [])[1];

    if (fb_dtsg)

    var userID = (jar.getCookies("https://www.facebook.com")
        .filter(cookie => ["c_user", "i_user"].includes(cookie.key))
        .pop() || {}).value;

    if (!userID) {
        if (global.Fca.Require.FastConfig.AutoLogin) {
            global.Fca.Require.logger.Warning(global.Fca.Require.Language.Index.AutoLogin);
            global.Fca.Require.logger.Warning("AppState lỗi - Khởi động lại để kích hoạt AutoLogin...");
            process.exit(1);
        } else {
            return global.Fca.Require.logger.Error(global.Fca.Require.Language.Index.ErrAppState);
        }
    }

    process.env['UID'] = userID;
    let needWarningHandle = false;
    let mqttEndpoint, region;

    const endpointMatch = html.match(/"endpoint":"([^"]+)"/);
    if (endpointMatch) {
        mqttEndpoint = endpointMatch[1].replace(/\\\//g, '/');
        const url = new URL(mqttEndpoint);
        region = url.searchParams.get('region')?.toUpperCase() || "PRN";

        if (endpointMatch.input.includes("100013112775163")) {
            logger.Warning("Tài khoản đã bị dính auto!");
            needWarningHandle = true;
        }
    } else {
        logger.Warning('Sử dụng MQTT endpoint mặc định');
        mqttEndpoint = `wss://edge-chat.facebook.com/chat?region=prn&sid=${userID}`;
        region = "PRN";
    }

    var ctx = {
        userID,
        wsReqNumber: 0,
        wsTaskNumber: 0,
        jar,
        clientID: utils.getGUID(),
        globalOptions,
        loggedIn: true,
        access_token: 'NONE',
        clientMutationId: 0,
        mqttClient: undefined,
        lastSeqId: irisSeqID,
        syncToken: undefined,
        mqttEndpoint,
        region,
        firstListen: true,
        fb_dtsg,
        req_ID: 0,
        lastPresence: Date.now(),
        debug: true
    };

    var defaultFuncs = utils.makeDefaults(html, userID, ctx);

    async function clearWarning(retries = 0) {
        try {
            const form = {
                av: userID,
                fb_api_caller_class: "RelayModern",
                fb_api_req_friendly_name: "FBScrapingWarningMutation",
                doc_id: "6339492849481770",
                variables: JSON.stringify({}),
                server_timestamps: true,
                fb_dtsg: ctx.fb_dtsg
            };

            const res = await defaultFuncs.post("https://www.facebook.com/api/graphql/", jar, form, globalOptions);
            const data = JSON.parse(res.body);

            if (data.data?.fb_scraping_warning_clear?.success) {
                logger.Normal("Đã xử lý thành công cảnh báo tài khoản!");
                logger.Normal("Đang khởi động lại bot...");
                await new Promise(resolve => setTimeout(resolve, 2000));
                const { execSync } = require('child_process');
                execSync('node index.js', {
                    stdio: 'inherit'
                });
                process.exit(1);
            }

            if (retries < 2) {
                await new Promise(resolve => setTimeout(resolve, 1000));
                return await clearWarning(retries + 1);
            }

            return false;

        } catch (e) {
            callback(e);
        }
    }

    var api = {
        setOptions: setOptions.bind(null, globalOptions),
        getAppState: () => utils.getAppState(jar),

        refreshDTSG: async function() {
            try {
                const res = await defaultFuncs.get('https://www.facebook.com/settings', jar, null, globalOptions);
                let newDtsg = null;

                let match = res.body.match(/\["DTSGInitialData",\[\],{"token":"([^"]+)"}/);
                if (match) {
                    logger.Normal("Refreshed fb_dtsg from DTSGInitialData");
                    newDtsg = match[1].replace(/\\/g, '');
                }

                if (!newDtsg) {
                    match = res.body.match(/{"token":"([^"]+)","async_get_token"/);
                    if (match) {
                        logger.Normal("Refreshed fb_dtsg from async_get_token");
                        newDtsg = match[1];
                    }
                }

                if (!newDtsg) {
                    match = res.body.match(/<input type="hidden" name="fb_dtsg" value="([^"]+)"/);
                    if (match) {
                        logger.Normal("Refreshed fb_dtsg from input field");
                        newDtsg = match[1];
                    }
                }

                if (!newDtsg) {
                    logger.Warning("Failed to refresh fb_dtsg - no pattern matched");
                    return ctx.fb_dtsg;
                }

                logger.Normal("Successfully refreshed fb_dtsg");
                ctx.fb_dtsg = newDtsg;
                return newDtsg;

            } catch (error) {
                logger.Warning("Error while refreshing fb_dtsg:", error.message);
                return ctx.fb_dtsg;
            }
        },

        sendRequest: async function(url, form = {}, qs = {}) {
            if (!form.fb_dtsg && ctx.fb_dtsg) {
                form.fb_dtsg = ctx.fb_dtsg;
            }

            try {
                const res = await defaultFuncs.post(url, ctx.jar, form, qs);

                if (res.body.includes('invalid_fb_dtsg')) {
                    logger.Warning("Invalid fb_dtsg detected, refreshing...");
                    await this.refreshDTSG();
                    form.fb_dtsg = ctx.fb_dtsg;
                    return await defaultFuncs.post(url, ctx.jar, form, qs);
                }

                return res;

            } catch (error) {
                throw error;
            }
        },

        postFormData: function(url, body) {
            return defaultFuncs.postFormData(url, ctx.jar, body);
        },

        clearWarning: async function() {
            return await clearWarning();
        }
    };

    if (needWarningHandle) {
        clearWarning().catch(e => {
            callback(e);
        });
    }

    fs.readdirSync(__dirname + "/src")
        .filter(f => f.endsWith(".js") && !f.includes('Dev_'))
        .forEach(f => {
            const name = f.split('.')[0];
            if ((f === 'getThreadInfo.js' && !global.Fca.Require.FastConfig.AntiGetInfo.AntiGetThreadInfo) ||
                (f === 'getUserInfo.js' && !global.Fca.Require.FastConfig.AntiGetInfo.AntiGetUserInfo)) {
                api[name] = require(`./src/${f.includes('getThreadInfo') ? 'getThreadMain.js' : 'getUserInfoMain.js'}`)(defaultFuncs, api, ctx);
            } else {
                api[name] = require(`./src/${f}`)(defaultFuncs, api, ctx);
            }
        });

    return {ctx, defaultFuncs, api};
}

function makeLogin(jar, email, password, loginOptions, callback, prCallback) {
    return function(res) {
        var html = res.body,$ = cheerio.load(html),arr = [];

        $("#login_form input").map((i, v) => arr.push({ val: $(v).val(), name: $(v).attr("name") }));

        arr = arr.filter(function(v) {
            return v.val && v.val.length;
        });
        var form = utils.arrToForm(arr);
            form.lsd = utils.getFrom(html, "[\"LSD\",[],{\"token\":\"", "\"}");
            form.lgndim = Buffer.from("{\"w\":1440,\"h\":900,\"aw\":1440,\"ah\":834,\"c\":24}").toString('base64');
            form.email = email;
            form.pass = password;
            form.default_persistent = '0';
            form.locale = 'en_US';
            form.timezone = '240';
            form.lgnjs = ~~(Date.now() / 1000);

        html.split("\"_js_").slice(1).map((val) => {
            jar.setCookie(utils.formatCookie(JSON.parse("[\"" + utils.getFrom(val, "", "]") + "]"), "facebook"),"https://www.facebook.com")
        });
        return utils
            .post("https://www.facebook.com/login/device-based/regular/login/?login_attempt=1&lwv=110", jar, form, loginOptions)
            .then(utils.saveCookies(jar))
            .then(function(res) {
                var headers = res.headers;
                if (!headers.location) throw { error: Language.InvaildAccount };

                if (headers.location.indexOf('https://www.facebook.com/checkpoint/') > -1) { throw { error: 'checkpoint-detected' }; }
            return utils.get('https://www.facebook.com/', jar, null, loginOptions).then(utils.saveCookies(jar));
        });
    };
}

function backup(data,globalOptions, callback, prCallback) {
    try {
        var appstate;
        try {
            appstate = JSON.parse(data)
        }
        catch(e) {
            appstate = data;
        }
            logger.Warning(Language.BackupNoti);
        try {
            loginHelper(appstate,null,null,globalOptions, callback, prCallback)
        }
        catch (e) {
            logger.Error(Language.ErrBackup);
            process.exit(0);
        }
    }
    catch (e) {
        logger.Error();
    }
}

function loginHelper(appState, email, password, globalOptions, callback, prCallback) {
    var mainPromise = null;
    var jar = utils.getJar();

    try {
        if (appState) {

            switch (Database().has("FBKEY")) {
                case true: {
                    process.env.FBKEY = Database().get("FBKEY");
                }
                    break;
                case false: {
                    const SecurityKey = global.Fca.Require.Security.create().apiKey;
                        process.env['FBKEY'] = SecurityKey;
                    Database().set('FBKEY', SecurityKey);
                }
                    break;
                default: {
                    const SecurityKey = global.Fca.Require.Security.create().apiKey;
                        process.env['FBKEY'] = SecurityKey;
                    Database().set('FBKEY', SecurityKey);
                }
            }
            try {
                switch (global.Fca.Require.FastConfig.EncryptFeature) {
                    case true: {
                        logger.Normal("Tìm thấy AppState");
                        appState = JSON.parse(JSON.stringify(appState, null, "\t"));
                        switch (utils.getType(appState)) {
                            case "Array": {
                                switch (utils.getType(appState[0])) {
                                    case "Object": {
                                        logger.Normal("[AppState đã được mã hóa");
                                        logger.Normal(Language.NotReadyToDecrypt);
                                    }
                                        break;
                                    case "String": {
                                        appState = Security(appState,process.env['FBKEY'],'Decrypt');
                                        logger.Normal("Giải mã AppState thành công");
                                        logger.Normal(Language.DecryptSuccess);
                                    }
                                        break;
                                    default: {
                                        logger.Warning(Language.InvaildAppState);
                                        process.exit(0)
                                    }
                                }
                            }
                                break;
                            default: {
                                logger.Warning(Language.InvaildAppState);
                                process.exit(0)
                            }
                        }
                    }
                        break;
                    case false: {
                        logger.Normal("AppState đã sẵn sàng");
                        switch (utils.getType(appState)) {
                            case "Array": {
                                switch (utils.getType(appState[0])) {
                                    case "Object": {
                                        logger.Normal("Chế độ mã hóa đã tắt");
                                        logger.Normal(Language.EncryptStateOff);
                                    }
                                        break;
                                    case "String": {
                                        appState = Security(appState,process.env['FBKEY'],'Decrypt');
                                        logger.Normal("Giải mã AppState (chế độ mã hóa đã tắt)");
                                        logger.Normal(Language.EncryptStateOff);
                                        logger.Normal(Language.DecryptSuccess);
                                    }
                                        break;
                                    default: {
                                        logger.Warning(Language.InvaildAppState);
                                        process.exit(0)
                                    }
                                }
                            }
                                break;
                            default: {
                                logger.Warning(Language.InvaildAppState);
                                process.exit(0)
                            }
                        }
                    }
                        break;
                    default: {
                        logger.Warning(getText(Language.IsNotABoolean,global.Fca.Require.FastConfig.EncryptFeature))
                        process.exit(0);
                    }
                }
            }
            catch (e) {

            }

            try {
                appState = JSON.parse(appState);
            }
            catch (e) {
                try {
                    appState = appState;
                }
                catch (e) {
                    logger.Error();
                }
            }

            try {
                global.Fca.Data.AppState = appState;
                appState.map(function(c) {
                    var str = c.key + "=" + c.value + "; expires=" + c.expires + "; domain=" + c.domain + "; path=" + c.path + ";";
                    jar.setCookie(str, "http://" + c.domain);
                });
                Database().set('Backup', appState);
                mainPromise = utils.get('https://www.facebook.com/', jar, null, globalOptions, { noRef: true }).then(utils.saveCookies(jar));
            }
            catch (e) {
                if (e.message && e.message.includes("Malformed UTF-8")) {
                    logger.Warning("AppState is corrupted. Please get a new AppState from your browser.");
                    process.exit(1);
                }
                if (Database().has('Backup')) {
                    return backup(Database().get('Backup'), globalOptions, callback, prCallback);
                }
                else {
                    logger.Warning(Language.ErrBackup);
                    process.exit(0);
                }
            }
        }
        else {
            mainPromise = utils
                .get("https://www.facebook.com/", null, null, globalOptions, { noRef: true })
                .then(utils.saveCookies(jar))
                .then(makeLogin(jar, email, password, globalOptions, callback, prCallback))
                .then(function() {
                    return utils.get('https://www.facebook.com/', jar, null, globalOptions).then(utils.saveCookies(jar));
                });
        }
    } catch (e) {

    }

    function handleRedirect(res) {
        var reg = /<meta http-equiv="refresh" content="0;url=([^"]+)[^>]+>/;
        var redirect = reg.exec(res.body);
        if (redirect && redirect[1]) {
            return utils.get(redirect[1], jar, null, globalOptions).then(utils.saveCookies(jar));
        }
        return res;
    }

    var ctx, api;
    mainPromise = mainPromise
        .then(handleRedirect)
        .then(function(res) {
            let Regex_Via = /MPageLoadClientMetrics/gs;
            if (!Regex_Via.test(res.body)) {
                globalOptions.userAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
                return utils.get('https://www.facebook.com/', jar, null, globalOptions, { noRef: true }).then(utils.saveCookies(jar));
            }
            return res;
        })
        .then(handleRedirect)
        .then(function(res) {
            var html = res.body;
            var Obj = buildAPI(globalOptions, html, jar);
            ctx = Obj.ctx;
            api = Obj.api;
            return res;
        });

    if (globalOptions.pageID) {
        mainPromise = mainPromise
            .then(function() {
                return utils.get('https://www.facebook.com/' + ctx.globalOptions.pageID + '/messages/?section=messages&subsection=inbox', ctx.jar, null, globalOptions);
            })
            .then(function(resData) {
                var url = utils.getFrom(resData.body, 'window.location.replace("https:\\/\\/www.facebook.com\\', '");').split('\\').join('');
                url = url.substring(0, url.length - 1);
                return utils.get('https://www.facebook.com' + url, ctx.jar, null, globalOptions);
            });
    }

    mainPromise
        .then(async() => {
            callback(null, api);
        })
        .catch(function(e) {
            callback(e);
        });
}

function setUserNameAndPassWord() {
    let rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    console.clear();
    console.log(figlet.textSync('Horizon', {font: 'ANSI Shadow',horizontalLayout: 'default',verticalLayout: 'default',width: 0,whitespaceBreak: true }));
    console.log(chalk.bold.hex('#9900FF')("[</>]") + chalk.bold.yellow(' => ') + "Operating System: " + chalk.bold.red(os.type()));
    console.log(chalk.bold.hex('#9900FF')("[</>]") + chalk.bold.yellow(' => ') + "Machine Version: " + chalk.bold.red(os.version()));
    console.log(chalk.bold.hex('#9900FF')("[</>]") + chalk.bold.yellow(' => ') + "Fca Version: " + chalk.bold.red(global.Fca.Version) + '\n');

    const existingAccount = Database().get("Account");
    const existingPassword = Database().get("Password");
    const existing2FA = Database().get("2FA");

    if (existingAccount && existingPassword) {
        logger.Normal(`Đã tìm thấy thông tin tài khoản: ${existingAccount}`);
        logger.Normal("2FA: " + (existing2FA ? "Đã cấu hình" : "Chưa cấu hình"));

        rl.question("Bạn có muốn sử dụng thông tin hiện tại không? (y/n): ", function (useExisting) {
            if (useExisting.toLowerCase() === 'y' || useExisting.toLowerCase() === 'yes') {
                rl.close();
                logger.Success("Sử dụng thông tin tài khoản từ database");
                process.exit(1);
                return;
            }

            promptForNewCredentials();
        });
    } else {
        promptForNewCredentials();
    }

    function promptForNewCredentials() {
        try {
            rl.question(Language.TypeAccount, (Account) => {
                if (!Account.includes("@") && global.Fca.Require.utils.getType(parseInt(Account)) != "Number") return logger.Normal(Language.TypeAccountError, function () { process.exit(1) });
                    else rl.question(Language.TypePassword, function (Password) {
                        rl.question("Nhập mã 2FA (để trống nếu không có): ", function (TwoFA) {
                            rl.close();
                            try {
                                Database().set("Account", Account);
                                Database().set("Password", Password);
                                if (TwoFA && TwoFA.trim() !== '') {
                                    Database().set("2FA", TwoFA.trim());
                                } else {

                                    if (Database().has("2FA")) {
                                        Database().delete("2FA");
                                    }
                                }
                            }
                            catch (e) {
                                logger.Warning(Language.ErrDataBase);
                                    logger.Error();
                                process.exit(0);
                            }
                            if (global.Fca.Require.FastConfig.ResetDataLogin) {
                                global.Fca.Require.FastConfig.ResetDataLogin = false;
                                global.Fca.Require.fs.writeFileSync(process.cwd() + '/FastConfigFca.json', JSON.stringify(global.Fca.Require.FastConfig, null, 4));
                            }
                        logger.Success(Language.SuccessSetData);
                        process.exit(1);
                        });
                });
            });
        }
        catch (e) {
            logger.Error(e)
        }
    }
}

function login(loginData, options, callback) {
    if (utils.getType(options) === 'Function' || utils.getType(options) === 'AsyncFunction') {
        callback = options;
        options = {};
    }

    var globalOptions = {
        selfListen: false,
        listenEvents: true,
        listenTyping: false,
        updatePresence: false,
        forceLogin: false,
        autoMarkDelivery: false,
        autoMarkRead: false,
        autoReconnect: true,
        logRecordSize: 100,
        online: false,
        emitReady: false,
        userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    };

    var prCallback = null;
    if (utils.getType(callback) !== "Function" && utils.getType(callback) !== "AsyncFunction") {
        var rejectFunc = null;
        var resolveFunc = null;
        var returnPromise = new Promise(function(resolve, reject) {
            resolveFunc = resolve;
            rejectFunc = reject;
        });
        prCallback = function(error, api) {
            if (error) return rejectFunc(error);
            return resolveFunc(api);
        };
        callback = prCallback;
    }

    if (loginData.email && loginData.password) {
        setOptions(globalOptions, {
            logLevel: "silent",
            forceLogin: true,
            userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        });
        loginHelper(loginData.appState, loginData.email, loginData.password, globalOptions, callback, prCallback);
    }
    else if (loginData.appState) {
        setOptions(globalOptions, options);
        let All = (getAll()).filter(i => i.data.messageCount !== undefined);
            if (All.length >= 1) {
                deleteAll(All.map(obj => obj.data.threadID));
            }

        if (global.Fca.Require.FastConfig.ResetDataLogin) return setUserNameAndPassWord();

        if (global.Fca.Require.FastConfig.ResetDatabase) {
            try {
                Database().delete("Account");
                Database().delete("Password");
                Database().delete("2FA");
                Database().delete("TempState");
                global.Fca.Require.FastConfig.ResetDatabase = false;
                global.Fca.Require.fs.writeFileSync(process.cwd() + '/FastConfigFca.json', JSON.stringify(global.Fca.Require.FastConfig, null, 4));
                logger.Success("Đã reset thông tin database thành công!");
                return setUserNameAndPassWord();
            }
            catch (e) {
                logger.Warning("Lỗi khi reset database");
                logger.Error();
            }
        }

        if (global.Fca.Require.FastConfig.AutoLogin) {
            const existingAccount = Database().get("Account");
            const existingPassword = Database().get("Password");

            if (!existingAccount || !existingPassword) {
                logger.Warning("AutoLogin được bật trong FastConfigFca nhưng thiếu thông tin tài khoản");
                logger.Warning("Chuyển sang chế độ nhập thông tin thủ công");

                global.Fca.Require.FastConfig.AutoLogin = false;
                global.Fca.Require.fs.writeFileSync(
                    process.cwd() + '/FastConfigFca.json',
                    JSON.stringify(global.Fca.Require.FastConfig, null, 4)
                );

                return setUserNameAndPassWord();
            } else {
                logger.Success("✓ AutoLogin đã được kích hoạt - Sử dụng thông tin từ database");
                logger.Normal(`Tài khoản: ${existingAccount}`);
                logger.Normal(`2FA: ${Database().get("2FA") ? "Đã cấu hình" : "Chưa cấu hình"}`);

            }
        } else {

        }

        try {
            const db = Database();
            let TempState = null;

            try {
                if (db && typeof db.get === 'function') {
                    TempState = db.get("TempState");
                }
            } catch (dbError) {
                console.log("Lỗi khi đọc TempState:", dbError.message);
                TempState = null;
            }

            if (TempState && TempState !== null && TempState !== undefined) {
                try {
                    if (typeof TempState === 'string') {
                        loginData.appState = JSON.parse(TempState);
                    } else {
                        loginData.appState = TempState;
                    }
                    console.log("✓ Đã khôi phục AppState từ TempState");
                } catch (parseError) {
                    console.log("Lỗi khi parse TempState:", parseError.message);
                    loginData.appState = TempState;
                }

                try {
                    if (db && typeof db.delete === 'function') {
                        db.delete("TempState");
                    }
                } catch (delError) {
                    console.log("Không thể xóa TempState:", delError.message);
                }
            }
        } catch (e) {
            console.log("Lỗi tổng quát khi xử lý TempState:", e.message);
        }

        return loginHelper(loginData.appState, loginData.email, loginData.password, globalOptions, callback, prCallback);
    }
    return returnPromise;
}
module.exports = login;