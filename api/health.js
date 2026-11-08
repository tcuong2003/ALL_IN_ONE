export default function handler(req, res) {
  let webpushStatus = 'ok';
  let webpushError = null;
  try {
    const webpush = require('web-push');
  } catch (e) {
    webpushStatus = 'failed';
    webpushError = e.message;
  }
  res.status(200).json({
    ok: true,
    node: process.version,
    webpushStatus,
    webpushError
  });
}
