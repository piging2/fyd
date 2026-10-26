import { createRequire } from 'node:module';
const realNodemailer = createRequire(import.meta.url)('nodemailer');

async function barrier(name) {
  const wait = new Promise(resolve => {
    const listener = message => {
      if (message?.kind === 'release' && message.name === name) {
        process.off('message', listener);
        resolve();
      }
    };
    process.on('message', listener);
  });
  process.send({ kind: 'barrier', name, actor: process.env.FYD_P0_ACTOR });
  await wait;
}
export default {
  createTransport() {
    const transporter = realNodemailer.createTransport({
      host: '127.0.0.1', port: Number(process.env.FYD_P0_SMTP_PORT),
      secure: false, ignoreTLS: true, connectionTimeout: 3000,
      greetingTimeout: 3000, socketTimeout: 3000,
    });
    return {
      async sendMail(mail) {
        if (process.env.FYD_P0_BARRIER === 'before-smtp') await barrier('before-smtp');
        const result = await transporter.sendMail(mail);
        process.send({ kind: 'smtp-returned', acceptedCount: result.accepted?.length ?? 0 });
        if (process.env.FYD_P0_BARRIER === 'after-acceptance') await barrier('after-acceptance');
        return result;
      },
    };
  },
};
