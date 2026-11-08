module.exports = (req, res) => {
  res.status(200).json({
    ok: true,
    message: 'All In One Serverless API is working!',
    time: new Date().toISOString()
  });
};
