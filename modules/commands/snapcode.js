const fs = require("fs");
const path = require("path");
const { createCanvas } = require("canvas");

module.exports.config = {
  name: "snapcode",
  version: "2.0.4",
  hasPermssion: 2,
  credits: "Atomic",
  description: "Screen code",
  commandCategory: "Admin",
  usages: "snapcode <path> [theme] | snapcode -c <file> [theme] | snapcode -s <file> [theme]",
  cooldowns: 5
};

const THEMES = {
  dark: {
    frameBg: "#000000", titlebar: "#3C3C3C", body: "#000000", titleColor: "#E5E5E5",
    divider: "#303030", gutter: "#858585", pipe: "#3A3A3A", windowBorder: "#3A3A3A",
    tokens: {
      default: "#D4D4D4", keyword: "#C586C0", string: "#CE9178", stringProperty: "#CE9178",
      stringUrl: "#CE9178", number: "#B5CEA8",       comment: "#22C55E", function: "#61AFEF",
      operator: "#D4D4D4", punctuation: "#D4D4D4", builtin: "#4FC1FF", property: "#9CDCFE"
    }
  },
  light: {
    frameBg: "#FFFFFF", titlebar: "#D1D5DB", body: "#FFFFFF", titleColor: "#374151",
    divider: "#D1D5DB", gutter: "#9AA0A6", pipe: "#C4C7C5", windowBorder: "#D1D5DB",
    tokens: {
      default: "#1F2937", keyword: "#6F42C1", string: "#22863A", stringProperty: "#D73A49",
      stringUrl: "#005CC5", number: "#D73A49",       comment: "#22C55E", function: "#005CC5",
      operator: "#032F62", punctuation: "#032F62", builtin: "#B08800", property: "#0969DA"
    }
  }
};

function hiDPICanvas(w, h, ratio = 2) {
  const canvas = createCanvas(w * ratio, h * ratio);
  const ctx = canvas.getContext("2d");
  ctx.scale(ratio, ratio);
  return { canvas, ctx };
}

function roundedRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function drawMacTrafficLights(ctx, x, y) {
  const colors = ["#FF5F57", "#FFBD2E", "#28C840"];
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.arc(x + i * 22, y, 6, 0, Math.PI * 2);
    ctx.fillStyle = colors[i];
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x + i * 22 - 2, y - 2, 1.5, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255,255,255,0.7)";
    ctx.fill();
  }
}

function drawWindow(ctx, { width, height, title, theme }) {
  const T = THEMES[theme];
  const radius = 14, titlebarH = 32;
  
  ctx.fillStyle = theme === "dark" ? "#000000" : "#F9FAFB";
  ctx.fillRect(0, 0, width, height);
  
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.25)";
  ctx.shadowBlur = 20;
  ctx.shadowOffsetY = 6;
  roundedRect(ctx, 0, 0, width, height, radius);
  ctx.fillStyle = T.frameBg;
  ctx.fill();
  ctx.restore();
  
  ctx.save();
  ctx.lineWidth = 1;
  ctx.strokeStyle = T.windowBorder;
  roundedRect(ctx, 0.5, 0.5, width - 1, height - 1, radius);
  ctx.stroke();
  ctx.restore();
  
  roundedRect(ctx, 0, 0, width, height, radius);
  ctx.clip();
  
  ctx.fillStyle = T.titlebar;
  ctx.fillRect(0, 0, width, titlebarH);
  drawMacTrafficLights(ctx, 22, 16);
  
  ctx.font = `500 13px "Fira Code", "JetBrains Mono", Menlo, Monaco, Consolas, "Courier New", monospace`;
  ctx.fillStyle = T.titleColor;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(title, width / 2, titlebarH / 2);
  
  ctx.fillStyle = T.body;
  ctx.fillRect(0, titlebarH, width, height - titlebarH);
  
  return { titlebarH };
}

const RE = {
  ws: /^[ \t]+/,
  commentLine: /^\/\/.*/,
  commentBlock: /^\/\*[\s\S]*?\*\//,
  stringDq: /^"([^"\\]|\\.)*"?/,
  stringSq: /^'([^'\\]|\\.)*'?/,
  stringBt: /^`([^`\\]|\\.|(\$\{[^}]*\}))*`?/,
  number: /^\b(0x[0-9a-fA-F]+|0b[01]+|0o[0-7]+|\d+(\.\d+)?([eE][+-]?\d+)?)\b/,
  keyword: /^\b(await|break|case|catch|class|const|continue|debugger|default|delete|do|else|enum|export|extends|false|finally|for|from|function|get|if|import|in|instanceof|let|new|null|of|return|set|static|super|switch|this|throw|true|try|typeof|var|void|while|with|yield)\b/,
  builtin: /^\b(Array|Boolean|Date|Error|Function|JSON|Math|Number|Object|Promise|RegExp|String|Map|Set|WeakMap|WeakSet|Symbol|BigInt|URL|console|global|process|require|module|exports)\b/,
  ident: /^[A-Za-z_$][A-Za-z0-9_$]*/,
  operator: /^(===|!==|==|!=|<=|>=|=>|\+\+|--|\+|-|\*|\/|%|\|\||&&|!|~|&|\||\^|<<|>>|>>>|=|\?|:)/,
  punctuation: /^([()[\]{},.;])/
};

function tokenizeJS(line) {
  const tokens = [];
  let s = line;
  
  while (s.length) {
    let m;
    if ((m = s.match(RE.ws))) { tokens.push({ t: "ws", v: m[0] }); s = s.slice(m[0].length); }
    else if ((m = s.match(RE.commentLine))) { tokens.push({ t: "comment", v: s }); break; }
    else if ((m = s.match(RE.commentBlock))) { tokens.push({ t: "comment", v: m[0] }); s = s.slice(m[0].length); }
    else if ((m = s.match(RE.keyword))) { tokens.push({ t: "keyword", v: m[0] }); s = s.slice(m[0].length); }
    else if ((m = s.match(RE.builtin))) { tokens.push({ t: "builtin", v: m[0] }); s = s.slice(m[0].length); }
    else if ((m = s.match(RE.number))) { tokens.push({ t: "number", v: m[0] }); s = s.slice(m[0].length); }
    else if ((m = s.match(RE.stringBt))) { tokens.push({ t: "string", v: m[0] }); s = s.slice(m[0].length); }
    else if ((m = s.match(RE.stringDq))) {
      const isUrl = /^"https?:\/\//.test(m[0]);
      const isProp = s.slice(m[0].length).trimStart().startsWith(":");
      const type = isUrl ? "stringUrl" : isProp ? "stringProperty" : "string";
      tokens.push({ t: type, v: m[0] }); 
      s = s.slice(m[0].length);
    }
    else if ((m = s.match(RE.stringSq))) {
      const isUrl = /^'https?:\/\//.test(m[0]);
      const isProp = s.slice(m[0].length).trimStart().startsWith(":");
      const type = isUrl ? "stringUrl" : isProp ? "stringProperty" : "string";
      tokens.push({ t: type, v: m[0] }); 
      s = s.slice(m[0].length);
    }
    else if ((m = s.match(RE.ident))) {
      const look = s.slice(m[0].length).trimStart();
      const type = look.startsWith("(") ? "function" : look.startsWith(":") ? "property" : "ident";
      tokens.push({ t: type, v: m[0] });
      s = s.slice(m[0].length);
    }
    else if ((m = s.match(RE.operator))) { tokens.push({ t: "operator", v: m[0] }); s = s.slice(m[0].length); }
    else if ((m = s.match(RE.punctuation))) { tokens.push({ t: "punctuation", v: m[0] }); s = s.slice(m[0].length); }
    else { tokens.push({ t: "default", v: s[0] }); s = s.slice(1); }
  }
  
  return tokens;
}

function tokenColor(T, t) {
  return T.tokens[t] || T.tokens.default;
}

function countWrappedRows(ctx, tokens, maxWidth) {
  let x = 0, rows = 1;
  for (const tok of tokens) {
    for (const ch of tok.v) {
      const w = ctx.measureText(ch).width;
      if (x + w > maxWidth) { rows++; x = 0; }
      x += w;
    }
  }
  return rows;
}

function parseArgs(args) {
  let mode = "path", fileArg = "", theme = "dark";
  
  if (args[0] === "-c") {
    mode = "commands";
    fileArg = args[1] || "";
    theme = THEMES[args[2]] ? args[2] : theme;
  } else if (args[0] === "-s") {
    mode = "src";
    fileArg = args[1] || "";
    theme = THEMES[args[2]] ? args[2] : theme;
  } else {
    fileArg = args[0] || "";
    theme = THEMES[args[1]] ? args[1] : theme;
  }
  
  return { mode, fileArg, theme };
}

module.exports.run = async ({ api, event, args }) => {
  const { mode, fileArg, theme } = parseArgs(args);
  
  if (!fileArg) {
    return api.sendMessage(
      "Cách dùng:\n• snapcode <path> [dark|light]\n• snapcode -c <file> [dark|light]\n• snapcode -s <file> [dark|light]",
      event.threadID, event.messageID
    );
  }
  
  let filePath;
  if (mode === "commands") filePath = path.join(__dirname, fileArg);
  else if (mode === "src") filePath = path.join(process.cwd(), "includes", "fca", "src", fileArg);
  else filePath = path.resolve(fileArg);
  
  if (!fs.existsSync(filePath)) {
    return api.sendMessage("⛔ Không tìm thấy file: " + filePath, event.threadID, event.messageID);
  }
  
  const code = fs.readFileSync(filePath, "utf8");
  const lines = code.split("\n");
  const linesPerImage = 100;
  const totalImages = Math.ceil(lines.length / linesPerImage);
  const paddingX = 20, gutterW = 80, contentLeft = paddingX + gutterW;
  const innerWidth = 1000, frameWidth = paddingX + gutterW + innerWidth + 20;
  const fontSize = 16, lineHeight = 20, topPadding = 14, bottomPadding = 18;
  const attachments = [], tempFiles = [], T = THEMES[theme];

  try {
    for (let imageIndex = 0; imageIndex < totalImages; imageIndex++) {
      const startLine = imageIndex * linesPerImage;
      const endLine = Math.min(startLine + linesPerImage, lines.length);
      const currentLines = lines.slice(startLine, endLine);

      const { ctx: mctx } = hiDPICanvas(10, 10, 1);
      mctx.font = `${fontSize}px "Fira Code", "JetBrains Mono", Menlo, Monaco, Consolas, "Courier New", monospace`;
      
      let totalRows = 0;
      const tokenCache = currentLines.map(l => tokenizeJS(l));
      for (const toks of tokenCache) totalRows += Math.max(1, countWrappedRows(mctx, toks, innerWidth - 6));

      const contentHeight = topPadding + totalRows * lineHeight + bottomPadding;
      const frameHeight = contentHeight + 32;
      const { canvas, ctx } = hiDPICanvas(frameWidth, frameHeight, 2);

      const { titlebarH } = drawWindow(ctx, {
        width: frameWidth, height: frameHeight,
        title: `${path.basename(filePath)} — ${imageIndex + 1}/${totalImages}`, theme
      });

      ctx.strokeStyle = T.divider;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(paddingX + gutterW - 10, titlebarH);
      ctx.lineTo(paddingX + gutterW - 10, frameHeight);
      ctx.stroke();

      ctx.font = `${fontSize}px "Fira Code", "JetBrains Mono", Menlo, Monaco, Consolas, "Courier New", monospace`;
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";

      let currentY = titlebarH + topPadding;

      currentLines.forEach((line, idx) => {
        const toks = tokenCache[idx];
        const lineNumber = startLine + idx + 1;

        ctx.fillStyle = T.gutter;
        ctx.textAlign = "right";
        ctx.fillText(String(lineNumber).padStart(4, " "), paddingX + gutterW - 18, currentY);

        ctx.textAlign = "left";
        ctx.fillStyle = T.pipe;
        ctx.fillText("|", paddingX + gutterW - 6, currentY);

        let x = contentLeft, wroteAny = false;
        const maxTextWidth = contentLeft + innerWidth - 6;

        for (const tok of toks) {
          const color = tokenColor(T, tok.t);
          for (const ch of tok.v) {
            const w = ctx.measureText(ch).width;
            if (x + w > maxTextWidth) {
              x = contentLeft;
              currentY += lineHeight;
              wroteAny = false;
            }
            if (!wroteAny) {
              ctx.fillStyle = T.pipe;
              ctx.fillText("|", paddingX + gutterW - 6, currentY);
            }
            ctx.fillStyle = color;
            ctx.fillText(ch, x, currentY);
            x += w;
            wroteAny = true;
          }
        }
        currentY += lineHeight;
      });

      const imgPath = path.join(__dirname, `code_${Date.now()}_${imageIndex + 1}.png`);
      const buffer = canvas.toBuffer("image/png", { compressionLevel: 9, filters: 0 });
      fs.writeFileSync(imgPath, buffer);
      attachments.push(fs.createReadStream(imgPath));
      tempFiles.push(imgPath);
    }

    const prefix = mode === "commands" ? "(modules/commands/)" : mode === "src" ? "(includes/fca/src/)" : "";
    const messageBody = totalImages > 1
      ? `📸 Code: ${prefix}${fileArg}\n🎨 Theme: ${theme}\n📄 ${lines.length} dòng • ${totalImages} ảnh`
      : `📸 Code: ${prefix}${fileArg}\n🎨 Theme: ${theme}`;

    return api.sendMessage(
      { body: messageBody, attachment: attachments },
      event.threadID,
      () => tempFiles.forEach(f => fs.existsSync(f) && fs.unlinkSync(f)),
      event.messageID
    );
  } catch (err) {
    console.error("Lỗi khi tạo ảnh:", err);
    tempFiles.forEach(f => fs.existsSync(f) && fs.unlinkSync(f));
    return api.sendMessage("⛔ Có lỗi xảy ra khi tạo ảnh code!", event.threadID, event.messageID);
  }
};