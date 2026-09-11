const authValidator = require('./authValidator');
const batchValidator = require('./batchValidator');
const postValidator = require('./postValidator');
const creditValidator = require('./creditValidator');
const notificationValidator = require('./notificationValidator');

module.exports = {
  ...authValidator,
  ...batchValidator,
  ...postValidator,
  ...creditValidator,
  ...notificationValidator,
};
