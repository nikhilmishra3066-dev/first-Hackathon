// Minimal SMTP client over implicit TLS (port 465), using only Node built-ins.
// Delivers real one-time codes from a personal Gmail account (App Password)
// without adding an npm dependency (the registry is unavailable in this project).
import { connect } from "node:tls";

const SMTP_TIMEOUT_MS = 10_000;

class SmtpError extends Error {}

// Resolves with the full reply once a final line ("<code> <text>", space not dash) arrives.
function readReply(socket, state, expected) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new SmtpError("SMTP reply timed out")), SMTP_TIMEOUT_MS);
    const onData = () => {
      const match = /(\r\n|^)(\d{3})([ ])[^\r\n]*\r\n$/.exec(state.text);
      if (!match) return;
      const code = Number(match[2]);
      const full = state.text;
      state.text = "";
      socket.removeListener("data", onData);
      clearTimeout(timer);
      if (expected && !expected.includes(code)) {
        reject(new SmtpError(`SMTP unexpected reply ${code}: ${full.trim()}`));
      } else {
        resolve({ code, text: full.trim() });
      }
    };
    socket.on("data", (chunk) => {
      state.text += chunk.toString("utf8");
      onData();
    });
    onData();
  });
}

function write(socket, line) {
  return new Promise((resolve, reject) => {
    socket.write(line + "\r\n", (err) => (err ? reject(err) : resolve()));
  });
}

function crlf(body) {
  return body.replace(/\r\n/g, "\n").replace(/\n/g, "\r\n");
}

function dotStuff(body) {
  return crlf(body).replace(/^\./gm, "..");
}

export function smtpConfigured(env) {
  return Boolean(env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS);
}

export async function sendSmtpMail({ env, from, to, subject, text, html }) {
  const host = env.SMTP_HOST || "smtp.gmail.com";
  const port = Number(env.SMTP_PORT || 465);
  const user = env.SMTP_USER;
  const pass = env.SMTP_PASS;
  const sender = from || user;

  const state = { text: "" };
  const socket = connect({ host, port, servername: host, rejectUnauthorized: true });
  socket.setTimeout(SMTP_TIMEOUT_MS);

  try {
    await new Promise((resolve, reject) => {
      socket.once("secureConnect", resolve);
      socket.once("error", reject);
      socket.once("timeout", () => reject(new SmtpError("SMTP connect timed out")));
    });

    await readReply(socket, state, [220]);
    await write(socket, `EHLO ${host}`);
    await readReply(socket, state, [250]);
    await write(socket, "AUTH LOGIN");
    await readReply(socket, state, [334]);
    await write(socket, Buffer.from(user, "utf8").toString("base64"));
    await readReply(socket, state, [334]);
    await write(socket, Buffer.from(pass, "utf8").toString("base64"));
    await readReply(socket, state, [235]);

    await write(socket, `MAIL FROM:<${sender}>`);
    await readReply(socket, state, [250]);
    await write(socket, `RCPT TO:<${to}>`);
    await readReply(socket, state, [250, 251]);
    await write(socket, "DATA");
    await readReply(socket, state, [354]);

    const boundary = "----safeher-otp";
    const message = [
      `From: ${sender}`,
      `To: ${to}`,
      `Subject: ${subject}`,
      "MIME-Version: 1.0",
      `Content-Type: multipart/alternative; boundary="${boundary}"`,
      "",
      `--${boundary}`,
      'Content-Type: text/plain; charset="UTF-8"',
      "",
      dotStuff(text),
      "",
      `--${boundary}`,
      'Content-Type: text/html; charset="UTF-8"',
      "",
      dotStuff(html),
      "",
      `--${boundary}--`,
      "",
      ".",
    ].join("\r\n");

    await new Promise((resolve, reject) => {
      socket.write(message + "\r\n", (err) => (err ? reject(err) : resolve()));
    });
    await readReply(socket, state, [250]);
    await write(socket, "QUIT");
  } finally {
    socket.destroy();
  }
}
