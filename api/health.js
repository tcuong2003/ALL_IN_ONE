module.exports = (req, res) => {
  let webpushStatus = 'ok';
  let webpushError = null;
  try {
    const webpush = require('web-push');
  } catch (err) {
    webpushStatus = 'failed';
    webpushError = err.message + '\n' + err.stack;
  }

  res.status(200).json({
    status: 'online',
    nodeVersion: process.version,
    env: process.env.NODE_ENV,
    webpushStatus,
    webpushError
  });
};
