# LinkedIn Content SaaS — v1 Spec

**One-liner:** An AI SaaS that turns a founder's weekly brain-dump into a fully elaborated, LinkedIn-ready content calendar — posts (caption + hashtags + images) generated, approved once, then auto-posted daily on autopilot.

**Target user (v1):** Solo founders / personal brand builders posting to their own LinkedIn profile.

**Monetization:** Credit-based. 1 credit = 1 generated post. Manual edits are free and unlimited. Regenerating a post (in whole or in part) costs 1 credit per regeneration. Fallback AI image generation (no user API key) costs 0 credits.

---

## 1. User Flow

1. **Guided prompt intake** — user answers a structured prompt: theme, professional level, tone/feel, writing style, and a free-text brain-dump of what they want to post about this week.
2. **Elaboration (backend, hidden from user)** — AI expands the raw input into a full content strategy: fills implied gaps, structures each idea with hook / story / CTA, keeps intent + tone consistent.
3. **Day-split recommendation** — system recommends N days (however many the elaborated content substantively supports). User can adjust by **±2 days** from the recommendation only.
4. **Post generation** — for each day: caption, 5 candidate hashtags (chosen from LinkedIn best-practice tags based on that post's content), and an image.
5. **Image pipeline** (per post, in order):
   - User-provided image → use it directly, 0 credits.
   - No user image → search licensed stock APIs (Unsplash / Pexels / Pixabay) for a relevant, free-to-use image.
   - No suitable stock match → AI-generate an image using the user's own image-gen API key if provided, otherwise fall back to the platform's default API key at **0 credit cost**.
6. **Confirmation screen** — user sees only the final 7 (or N) posts, never the intermediate elaboration.
   - Unlimited manual text edits, free.
   - Regenerate button (per post, whole-post or partial e.g. "just the caption" / "just the image") — costs 1 credit each use.
7. **Save + schedule** — on confirm, all post data is stored, tied to the user's chosen daily post time.
8. **Auto-posting** — scheduler fires daily, posts via LinkedIn's official Posts API (personal profile scope). When stock is exhausted, user gets a reminder to submit a fresh weekly dump.
9. **Failure handling** — if a scheduled post fails (expired token, API error, etc.), user is notified via email + SMS immediately.

---

## 2. LinkedIn API Notes (researched Sept 2026)

- Use **`w_member_social`** scope + the **"Share on LinkedIn"** product — this is a same-day self-serve approval for personal profile posting. Do NOT need `w_organization_social` / Community Management API for v1 (that's for company pages, weeks-to-months approval — skip it, out of scope until you go multi-tenant/agency).
- The public Posts API has **no native scheduling** — you must build your own scheduler (cron/queue) and fire the create-post call at the right time yourself. Use the `/rest/posts` endpoint (not the deprecated `/ugcPosts`).
- Rate limits: 150 requests/member/day, 100,000/app/day — not a concern at 1 post/day/user.
- **Access tokens expire in 60 days.** Build token-refresh logic (or a re-auth prompt flow) into the scheduler itself — this is the most likely silent-failure point and directly feeds your email/SMS failure alert.
- Excluded post types for scheduling automation: events, jobs, services (per LinkedIn's own scheduler rules) — not relevant to your text+image use case, but worth a validation check before posting.

---

## 3. Tech Stack

- **Frontend:** React (JS) + Tailwind CSS
- **Backend:** Node.js + Express
- **Database:** MongoDB
- **Scheduler:** Node cron job or a queue (e.g. BullMQ + Redis) polling due posts and firing LinkedIn API calls
- **Image sources:** Unsplash/Pexels/Pixabay APIs (licensed stock) → AI image-gen API (user key or platform default) as fallback
- **Notifications:** Email (e.g. SendGrid/Resend) + SMS (e.g. Twilio) for failure alerts

---

## 4. Rough Data Model (MongoDB collections)

**users**
- profile info, LinkedIn OAuth tokens (access + refresh, expiry), notification prefs, credit balance, optional image-gen API key

**contentBatches** (one per weekly dump)
- userId, raw prompt, elaborated strategy (internal, not shown to user), day count, status (draft / confirmed / active / exhausted), createdAt

**posts** (belongs to a batch)
- batchId, dayIndex, caption, hashtags[], imageUrl, imageSource (user/stock/ai), scheduledTime, status (pending / posted / failed), editRoundsUsed, linkedinPostId (once posted)

**creditTransactions**
- userId, postId, amount, reason (generation / regeneration), timestamp

**notifications/failures**
- userId, postId, failureReason, notifiedAt

---

## 5. MVP Cut-List (build in this order)

1. Guided prompt UI → elaboration → day-split recommendation (no posting yet, just generation + confirmation UI)
2. Credit system + regeneration logic
3. Image pipeline (stock API first, AI fallback second)
4. LinkedIn OAuth (personal profile scope) + manual "post now" button (validates the API integration works)
5. Scheduler + auto-post + token refresh
6. Failure notifications (email + SMS)
7. Stock-exhaustion reminder flow

---

## 6. Open Questions for Later (post-MVP)

- Multi-day time zone handling for scheduled posts
- What happens if a user disconnects LinkedIn mid-batch
- Analytics/reporting on post performance (LinkedIn does expose a Member Post Analytics API — could be a v2 feature)
- Agency/company-page support (separate, slower LinkedIn approval track)
