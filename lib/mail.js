const { Resend } = require('resend');

const ADMIN_EMAIL = 'akira5669@gmail.com';
// 独自ドメインを取得していないため、Resend既定のテスト用送信元(onboarding@resend.dev)を
// 使う。この送信元は、Resendアカウント所有者自身のメールアドレス宛てになら送信できる
// 制限があるが、通知の送り先は常に管理者(自分)自身なので問題ない。
const FROM_ADDRESS = 'onboarding@resend.dev';

function getResend() {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return null;
  return new Resend(apiKey);
}

async function sendAdminEmail(subject, text) {
  const resend = getResend();
  if (!resend) {
    console.log('[mail skipped: RESEND_API_KEY not set]', subject, text);
    return;
  }
  try {
    await resend.emails.send({ from: FROM_ADDRESS, to: ADMIN_EMAIL, subject, text });
  } catch (e) {
    console.error('email send failed:', subject, e);
  }
}

module.exports = { sendAdminEmail };
