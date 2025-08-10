const info = (message, data = {}) => {
  console.log('INFO:', message, data);
};

const logError = (message, error) => {
  console.error('ERROR:', message, error);
};

module.exports = { info, logError };