# Backend Architecture — Routes, Controllers, Middleware

Derived from `linkedin-content-saas-spec.md` (product flow) and the Mongoose schemas
(`User`, `ContentBatch`, `Post`, `CreditTransaction`, `Notification`).

---

## 1. Folder structure

```
src/
  config/          db.js, env.js
  models/          (already built — User.js, ContentBatch.js, Post.js, CreditTransaction.js, NotificationFailure.js, index.js)
  middleware/       auth.js, errorHandler.js, validate.js, ownership.js, creditCheck.js, rateLimiter.js, upload.js, linkedinGuard.js
  controllers/      authController.js, linkedinController.js, batchController.js, postController.js, creditController.js, notificationController.js
  routes/           authRoutes.js, linkedinRoutes.js, batchRoutes.js, postRoutes.js, creditRoutes.js, notificationRoutes.js, index.js
  services/         aiService.js, imageService.js, linkedinService.js, creditService.js, notificationService.js, schedulerService.js
  jobs/             scheduler.cron.js
  validators/       auth.validator.js, batch.validator.js, post.validator.js  (Joi/Zod schemas)
  utils/            AppError.js, asyncHandler.js, apiResponse.js
  app.js
  server.js
```

Controllers stay thin: validate → call a service → shape the response. All AI calls, LinkedIn API calls, image-source lookups, and credit math live in `services/`, not in controllers. This is what keeps the regenerate-and-refund logic (below) testable in isolation.

---

## 2. Middleware

| Middleware | Purpose |
|---|---|
| `auth.js` | Verifies JWT from `Authorization` header, loads the user, attaches `req.user`. Rejects with 401 if missing/invalid/expired. |
| `validate.js` | Generic factory `validate(schema)` — validates `req.body` / `req.params` / `req.query` against a Joi/Zod schema before the controller runs. Rejects with 400 + field-level errors. |
| `ownership.js` | Generic factory `ownsResource(Model, paramName)` — loads the doc by id, 404s if missing, 403s if `doc.userId !== req.user.id`. Used on every `:batchId` / `:postId` route to prevent one user editing another's data. |
| `creditCheck.js` | Checks `req.user.creditBalance >= requiredAmount` before regeneration endpoints. Rejects with 402-style "insufficient credits" error rather than letting the controller start work it can't pay for. |
| `linkedinGuard.js` | Checks `req.user.linkedin.isConnected` before batch-confirm / post-now. Rejects with 409 telling the client to connect LinkedIn first. |
| `rateLimiter.js` | `express-rate-limit` instance applied to AI-heavy routes (generation, regeneration) — protects your AI/image-gen API spend from abuse. |
| `upload.js` | Multer config for the image-upload route — restrict to image mimetypes, ~5MB cap. |
| `errorHandler.js` | Global error-handling middleware (last in the stack). Catches `AppError` (operational, has `statusCode`) and unexpected errors alike, returns a consistent JSON shape, logs unexpected ones. |
| `notFound.js` | Catches unmatched routes → 404 JSON before the error handler. |

All controller functions are wrapped in an `asyncHandler(fn)` utility so thrown/rejected errors go straight to `next(err)` instead of needing try/catch in every controller.

---

## 3. Routes

Base path: `/api/v1`

### Auth
| Method | Path | Middleware | Notes |
|---|---|---|---|
| POST | `/auth/register` | `validate` | Create user, hash password, return JWT |
| POST | `/auth/login` | `validate` | Verify credentials, return JWT |
| GET | `/auth/me` | `auth` | Return current user (no tokens/password) |

### LinkedIn
| Method | Path | Middleware | Notes |
|---|---|---|---|
| GET | `/linkedin/connect` | `auth` | Redirect to LinkedIn's OAuth consent screen. `state` = signed payload containing `userId` (CSRF-safe) |
| GET | `/linkedin/callback` | — | LinkedIn redirects here with `code` + `state`. Verify state, exchange code for tokens, save to `user.linkedin`, `isConnected = true` |
| DELETE | `/linkedin/disconnect` | `auth` | Clear stored tokens, `isConnected = false` |

### Content Batches
| Method | Path | Middleware | Notes |
|---|---|---|---|
| POST | `/batches` | `auth`, `validate` | Intake → elaborate → recommend day count. Creates batch with `status: 'draft'`. **Does not generate posts yet.** Returns `{ batchId, recommendedDayCount }` — never returns `elaboratedStrategy`. |
| GET | `/batches` | `auth` | List the user's batches (paginated) |
| GET | `/batches/:batchId` | `auth`, `ownership` | Full batch + its posts, for the confirmation screen. `elaboratedStrategy` excluded by schema default. |
| PATCH | `/batches/:batchId/day-count` | `auth`, `ownership`, `validate` | Body `{ finalDayCount }`. Reject if batch isn't `draft`, or if `\|finalDayCount - recommendedDayCount\| > 2`. On success: generates one `Post` per day (see §4), charges 1 credit per post generated. |
| POST | `/batches/:batchId/confirm` | `auth`, `ownership`, `linkedinGuard` | Reject if any post is missing caption/image. Computes `scheduledTime` per post from `user.timezone` + `user.defaultPostTime` + `dayIndex`. Sets `batch.status = 'active'`, `confirmedAt = now`. |
| DELETE | `/batches/:batchId` | `auth`, `ownership` | Only allowed while `status === 'draft'` — cancels an in-progress batch. |

### Posts
| Method | Path | Middleware | Notes |
|---|---|---|---|
| GET | `/posts/:postId` | `auth`, `ownership` | Fetch single post |
| PATCH | `/posts/:postId` | `auth`, `ownership`, `validate` | Manual edit (caption/hashtags). Free, unlimited. Only allowed while `post.status === 'pending'`. Appends `editHistory` entry `{ type: 'manual_edit' }`. |
| POST | `/posts/:postId/regenerate` | `auth`, `ownership`, `rateLimiter`, `creditCheck` | Body `{ part: 'caption' \| 'hashtags' \| 'image' \| 'whole' }`. See §5 for the charge-after-success ordering. |
| POST | `/posts/:postId/image` | `auth`, `ownership`, `upload` | Direct user image upload. Sets `image.source = 'user_upload'`. 0 credits. |
| POST | `/posts/:postId/post-now` | `auth`, `ownership`, `linkedinGuard` | MVP validation button (cut-list item 4) — posts immediately via `linkedinService`, bypassing the scheduler. |

### Credits
| Method | Path | Middleware | Notes |
|---|---|---|---|
| GET | `/credits/balance` | `auth` | Returns `creditBalance` |
| GET | `/credits/transactions` | `auth` | Paginated ledger from `CreditTransaction` |

### Notifications
| Method | Path | Middleware | Notes |
|---|---|---|---|
| GET | `/notifications` | `auth` | Paginated list |
| PATCH | `/notifications/:id/resolve` | `auth`, `ownership` | Mark resolved (e.g. after reconnecting LinkedIn) |

### Internal (cron trigger, for local testing only — protect with an admin key, not user JWT)
| Method | Path | Notes |
|---|---|---|
| POST | `/internal/scheduler/run-now` | Manually fire the scheduler pass without waiting for cron — useful in dev |

---

## 4. Batch → Post generation flow (`PATCH /batches/:batchId/day-count`)

1. Validate `finalDayCount` against the ±2 rule.
2. For `dayIndex = 1..finalDayCount`: call `aiService.generatePostContent(elaboratedStrategy, dayIndex, finalDayCount)` → `{ caption, hashtags }`.
3. For each generated post, run the image pipeline in order (`imageService`):
   - No user image at this stage (that comes later via upload) → search stock APIs (Unsplash → Pexels → Pixabay) for a relevant free-to-use image.
   - No stock match → AI-generate via user's key if present, else platform default key, at **0 credit cost** (the credit charge below is for the post generation itself, not the image fallback).
4. Charge **1 credit per post generated** — see the transaction pattern in §5 (generate content first, charge on success).
5. Insert `Post` documents with `status: 'pending'`, `scheduledTime: null` (set later at confirm).
6. Return the full post list to the client for the confirmation screen.

---

## 5. Credit charge ordering (generation + regeneration)

**Never deduct a credit before the AI/image call succeeds.** If you charge first and the AI call throws, the user paid for nothing.

Correct order:
1. Call the AI/image service, get the new content back successfully.
2. *Then* open a MongoDB session/transaction:
   - Decrement `user.creditBalance` by the amount.
   - Insert a `CreditTransaction` row (`reason`, `amount`, `balanceAfter`, `postId`).
   - Update the `Post` document with the new content, push `editHistory`, increment `regenerationCount` if it's a paid regen.
   - Commit. If any step fails, abort — the AI content is discarded, nothing is charged.

This requires a MongoDB replica set (even a single-node one) since multi-document transactions need it — flag this in local dev setup.

---

## 6. Scheduler (`jobs/scheduler.cron.js`, calls `schedulerService`)

Runs on an interval (e.g. every 1–5 minutes):

1. Query: `Post.find({ status: 'pending', scheduledTime: { $lte: now } })`.
2. For each post, load its user (with `+linkedin.accessToken`, `+linkedin.refreshToken`).
3. Check `user.linkedin.tokenExpiresAt`:
   - Expired → attempt `linkedinService.refreshToken(user)`. Fails → mark post `failed`, `failureReason: 'token_expired'`, create a `Notification` (`type: 'token_expired'`), send email + SMS, `continue`.
4. Call `linkedinService.createPost(user, post)`:
   - Success → `post.status = 'posted'`, `linkedinPostId`, `postedAt = now`.
   - Failure → `post.status = 'failed'`, `failureReason`, create `Notification` (`type: 'posting_failure'`), send email + SMS.
5. After processing a batch's last `dayIndex`, if every post in the batch is `posted` or `failed` → set `batch.status = 'exhausted'`, create a `Notification` (`type: 'low_stock'`) prompting a fresh weekly dump.

---

## 7. Response & error conventions

- Success: `{ success: true, data: <payload> }`
- Error: `{ success: false, message: <string>, errors?: [...] }` (field-level errors from `validate` middleware go in `errors`)
- Custom `AppError(message, statusCode)` class for all operational errors (validation, ownership, insufficient credits, LinkedIn not connected) — thrown from services/controllers, caught centrally by `errorHandler`.
- Unexpected (programmer) errors are logged with full stack server-side but returned to the client as a generic 500 message — never leak internals.
