// Central export so the rest of the app can do:
//   const { User, ContentBatch, Post, CreditTransaction, Notification } = require('./models');

module.exports = {
  User: require('./User'),
  ContentBatch: require('./ContentBatch'),
  Post: require('./Post'),
  CreditTransaction: require('./CreditTransaction'),
  Notification: require('./NotificationFailure'),
};
