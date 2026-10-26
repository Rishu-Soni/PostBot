/**
 * Defense-in-depth MongoDB / NoSQL injection sanitizer middleware.
 * Strips any object keys starting with '$' or containing '.' or '$' from
 * req.body, req.query, and req.params before reaching controllers.
 */

const sanitize = (target) => {
  if (!target || typeof target !== 'object') {
    return;
  }

  if (Array.isArray(target)) {
    for (let i = 0; i < target.length; i++) {
      if (typeof target[i] === 'object' && target[i] !== null) {
        sanitize(target[i]);
      }
    }
    return;
  }

  for (const key of Object.keys(target)) {
    if (key.includes('$') || key.includes('.')) {
      delete target[key];
    } else if (typeof target[key] === 'object' && target[key] !== null) {
      sanitize(target[key]);
    }
  }
};

const mongoSanitize = (req, res, next) => {
  if (req.body) sanitize(req.body);
  if (req.params) sanitize(req.params);
  if (req.query) sanitize(req.query);
  next();
};

module.exports = mongoSanitize;
