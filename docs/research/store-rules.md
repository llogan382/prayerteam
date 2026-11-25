# App Store and Play Store rules for a UGC prayer app

Research for [#6](https://github.com/llogan382/prayerteam/issues/6) (map: #1). Researched 2026-11-25 against primary sources; Apple's App Review Guidelines page reads "Last Updated: October 16, 2026".

**Question:** What do Apple's App Store Review Guidelines and Google Play policies require of an app with user-generated content (UGC) and accounts? Covers account deletion, report/block, moderation, privacy labels, the Play Data safety form, the privacy policy, invite-only apps and reviewer access.

## Short answer

Prayer Team is a UGC app on both stores. Being invite-only gives **no exemption** from any of the rules below. v1 must ship:

1. **Filtering, reporting, blocking and moderation of UGC**, with timely responses to Reports.
2. **Terms of use** that define objectionable content. Users must accept them before they can post (Play).
3. **Published contact info** inside the app (Apple).
4. **Real account deletion started from inside the app** that also deletes associated data, including shared posts. Play also requires a **public web page** where users can request deletion.
5. A **privacy policy**. Link it from the app and from both store consoles, and host it on a public, non-geofenced HTML URL.
6. **Apple App Privacy details** and the **Play Data safety form**. Both must be accurate and must include data collected by third-party SDKs.
7. **Reviewer access**: demo accounts that always work, plus a live backend. Seed a demo Church so reviewers can get past the invite gate.
8. If the Play developer account is a **personal account created after 13 Nov 2023**: a **closed test with 12+ testers opted in for 14 consecutive days** before you can publish to production.

## 1. User-generated content: filter, report, block, moderate

**Apple 1.2 User-Generated Content.** This guideline covers apps "that enable users to create, generate, upload, share, or otherwise contribute content". Such apps "must include:
- A method for filtering objectionable material from being posted to the app
- A mechanism to report offensive content and timely responses to concerns
- The ability to block abusive users from the service
- Published contact information so users can easily reach you"

Source: <https://developer.apple.com/app-store/review/guidelines/#user-generated-content>

**Google Play User Generated Content policy.** UGC apps must:
- require "users accept the app's terms of use and/or user policy before users can create or upload UGC"
- define objectionable content and behaviours, and prohibit them in those terms
- provide "an in-app system for reporting and blocking objectionable UGC and users"
- conduct "UGC moderation, as is reasonable and consistent with the type of UGC hosted by the app"
- take "action against UGC or users where appropriate"

The policy has **no exemption for closed or private groups**. Even apps whose users are verified or registered offline must "provide in-app functionality to report content and users."

Source: <https://support.google.com/googleplay/android-developer/answer/9876937>

**Religious content (Apple 1.1).** Guideline 1.1.1 bars defamatory or mean-spirited content "including references or commentary about religion". Guideline 1.1.5 bars "Inflammatory religious commentary or inaccurate or misleading quotations of religious texts." Apple can apply these to UGC that surfaces in the app, which is one more reason Church Admins need to be able to remove content.

**What this means for Prayer Team**
- Report and Block already exist, and Church Admins remove requests and Comments. That covers reporting, blocking and moderation. "Timely responses" means someone has to act on Reports: the Church Admin, with the Platform Admin as backstop.
- **Filtering is a gap.** Apple asks for "a method for filtering objectionable material from being posted". At minimum, ship a basic profanity/keyword filter on new posts. Apple is not specific about what counts as enough, so this is a judgement call. A pre-post filter plus admin removal is the usual approach.
- **Terms acceptance is a gap.** Members must accept terms of use / community rules before they can post. The natural place is Invite Link onboarding.
- **Contact information is a gap.** Show a support email or contact page inside the app, not only on the store listing.

## 2. Account deletion

**Apple 5.1.1(v):** "If your app supports account creation, you must also offer account deletion within the app."

Apple's account-deletion guidance (<https://developer.apple.com/support/offering-account-deletion-in-your-app/>) adds:
- Make the option "easy to find in your app. Typically, it's included in the app's account settings."
- "Offer to delete the entire account record, along with associated personal data… only offering to temporarily deactivate or disable an account is insufficient."
- If a website finishes the process, the app must "include a link directly to the page on your website where they can complete the process."
- Apps outside highly regulated industries "should not require people to make a phone call, send an email, use a chat support flow".
- Confirmation and verification steps are allowed, but not "unnecessarily difficult" ones.
- Manual or delayed deletion is acceptable as long as you tell users how long it will take and confirm when it is done.
- On shared UGC: "People expect that all data associated with their account will be deleted… This includes user-generated content that's shared with others, such as … text posts". If you keep anything for legal reasons, say what you keep.
- Sign in with Apple apps must revoke tokens through the REST API. This does not apply to Prayer Team, which uses email + password.

**Google Play User Data policy** (<https://support.google.com/googleplay/android-developer/answer/10144311>) and the account-deletion help page (<https://support.google.com/googleplay/android-developer/answer/13327111>):
- Users need a "readily discoverable option to initiate app account deletion from within your app **and outside of your app**". That means in-app plus a web resource.
- The web link goes in the Data safety form. The page must work, name the app or developer, and make the deletion path easy to find.
- "Temporary account deactivation, disabling, or 'freezing' the app account does not qualify as account deletion."
- Associated user data must be deleted too, including data held by service providers where you can request it. You may keep data "for legitimate reasons such as security, fraud prevention or regulatory compliance" if you disclose that, for example in the privacy policy.

**What this means for Prayer Team**
- Add an in-app "Delete account" option in settings that performs a real delete.
- Build a **public web deletion-request page** for Play. It can be the web app's own deletion screen.
- **Open decision:** what happens to a deleted Member's Prayer Requests, Updates, Comments and Prayed Marks. Apple's guidance expects shared text posts to be deleted. Anonymising instead ("Former member") is a defensible middle ground, but you must disclose it. It feeds the "data retention" item already listed under Not yet specified on #1.
- **Edge case:** a Church Admin, or the last Church Admin of a Church, deleting their account. Decide what happens to the Church.

## 3. Privacy policy

- **Apple 5.1.1(i):** "All apps must include a link to their privacy policy in the App Store Connect metadata field and within the app in an easily accessible manner." It must say what data is collected, how, and every use of it. It must confirm that third parties give equal protection, and explain retention and deletion and how users can revoke consent or request deletion.
- **Google Play (User Data policy):** put the link in the Play Console field **and** inside the app. Required contents: developer information and a privacy contact; the types of data accessed, collected, used and shared; secure handling; the retention and deletion policy; and a title that clearly says "privacy policy". It must be on "an active, publicly accessible and non-geofenced URL (no PDFs)".
- Play also requires the Data safety section to be consistent with the privacy policy.

## 4. Apple App Privacy details ("nutrition label")

Source: <https://developer.apple.com/app-store/app-privacy-details/>
- Required to submit new apps and updates. It must cover "the practices of third-party partners whose code you integrate", which includes analytics, crash reporting and other SDKs.
- "Collect" means sending data off the device and keeping it longer than needed to serve the request in real time.
- The data types Prayer Team will probably declare, all **linked to the user**: Contact Info → Name, Email Address; User Content → Other User Content (requests, Updates, Comments), Customer Support if there is a support channel; Identifiers → User ID, plus Device ID if push tokens or analytics use one; Diagnostics → Crash Data / Performance Data if error tracking is added.
- Declare **no tracking**, unless an ad or analytics SDK links data with third-party data for advertising. Avoid such SDKs.
- Keep the answers current. They can be updated without shipping a new build.

## 5. Google Play Data safety form

Source: <https://support.google.com/googleplay/android-developer/answer/10787469>
- Required for apps on closed, open or production tracks. Apps that exist **only** on internal testing are exempt.
- "Collect" means sending data off the device, including data sent by SDKs. Sending data to a **service provider** acting on your behalf (for example AWS or an email provider) is **not** "sharing".
- The form asks whether all data is **encrypted in transit** (it will be: HTTPS) and whether users can **request deletion** (yes, plus the web link from section 2).
- Google does not verify the answers, but inaccurate declarations can lead to enforcement.

## 6. Invite-only / closed community

- Neither store has a rule against invite-only apps, and neither exempts them from the UGC or account rules. Play explicitly applies reporting requirements to apps whose users are verified offline.
- **Apple 4.2 Minimum Functionality.** An app whose store listing leads only to a login wall can still pass, but the reviewer must be able to see the full functionality (see section 7). Apple 5.1.1(v) allows login when the app has "significant account-based features", which this app does.
- **Apple Unlisted App Distribution** (<https://developer.apple.com/support/unlisted-app-distribution/>) is optional. It hides the app from search, charts and categories so it is reachable only by direct link. The app still goes through full App Review, and it is not available for beta builds. "Unlisted apps are available to anyone who has access to the link", so invite gating stays in the app. This fits Prayer Team if you don't want strangers installing it and hitting a login wall. It is a product choice, not a requirement.
- **Apple 4.8 Login Services:** another login option is only required if you use a third-party or social login for the primary account. Prayer Team's own email + password is exempt ("Your app exclusively uses your company's own account setup and sign-in systems"). **Sign in with Apple is not required.**

## 7. Reviewer access (demo accounts)

- **Apple 2.1(a) and "Before You Submit":** "include demo account info (and turn on your back-end service!) if your app includes a login". Provide "an active demo account or fully-featured demo mode". Backend services must be "live and accessible during review."
- **Google Play App access** (<https://support.google.com/googleplay/android-developer/answer/15748846>): credentials must be "accessible at all times, reusable, and valid regardless of user location", in English. Replace one-time codes and 2-step verification with reusable logins. An expired password can cause rejection. Instructions for restricted areas are allowed.
- **What this means for Prayer Team:** provision a permanent **demo Church** with seeded Teams, Prayer Requests and Comments. Give reviewers a Member login and ideally a Church Admin login too, so they can see Reports and removal. Reviewers then never need an Invite Link. Make sure the demo account cannot be deleted by accident or locked out, and that email verification doesn't block it. **Note:** a reviewer may test account deletion on the demo account, so either be able to recreate it or give a second account.

## 8. Google Play: new personal developer accounts

Source: <https://support.google.com/googleplay/android-developer/answer/14151465>
- Personal developer accounts "created after November 13, 2023, must run a closed test" with "a minimum of 12 testers who have been opted in continuously for at least 14 days" before applying for production. The application asks about the test, the audience and readiness, and needs working test login credentials.
- An **organization** developer account (which needs a D-U-N-S number) avoids this requirement. The source doesn't say so directly; it only describes personal accounts.
- This affects the release timeline. A pilot church can supply the 12 testers.

## 9. Age rating

Apple's age-rating definitions (<https://developer.apple.com/help/app-store-connect/reference/app-information/age-ratings-values-and-definitions/>) list "User-generated content" and "Messaging and chat" as capabilities that are compatible with 4+. **"Social media"** ("interaction with user-generated content through a social feed or similar discovery method that visibly spreads content to many users") pushes the rating to **13+**. A Team-scoped prayer feed is arguably not broad-distribution social media, but answer the questionnaire carefully. Play's IARC questionnaire asks similar questions about users interacting. That was not researched in depth here.

## Requirements checklist (v1)

- [ ] Pre-post objectionable-content filter (keyword/profanity) on Prayer Requests, Updates and Comments
- [ ] In-app Report on requests, Updates, Comments and users, routed to the Church Admin, with the Platform Admin as backstop and a target response time
- [ ] In-app Block of users
- [ ] Church Admin / Platform Admin can remove content and remove Members
- [ ] Terms of use / community rules defining objectionable content, accepted before a Member can post
- [ ] Contact information visible inside the app
- [ ] In-app "Delete account" in settings that is a real delete (not deactivation), with an expected timeline and confirmation
- [ ] Public web page for account deletion requests, linked in the Play Data safety form
- [ ] Decide and disclose what happens to a deleted Member's content (delete vs anonymise)
- [ ] Privacy policy: public HTML URL, linked in App Store Connect, Play Console and inside the app; covers data types, uses, third parties, retention/deletion, contact
- [ ] Apple App Privacy details: Name, Email, Other User Content, User ID (+ Device ID, Crash/Performance data if used), all linked, no tracking
- [ ] Play Data safety form: same data types, encrypted in transit, deletion supported
- [ ] Permanent seeded demo Church with reusable Member and Church Admin reviewer logins, no OTP/email-verification blocker, backend live during review
- [ ] Play: closed test with 12+ testers for 14 days if the account is personal and new, or use an organization account
- [ ] Optional: request Apple Unlisted App Distribution
- [ ] Answer the age-rating questionnaires accurately (UGC / messaging / social media)

## Open questions surfaced

1. **Content fate on account deletion / leaving a Church**: delete or anonymise Prayer Requests, Updates, Comments and Prayed Marks? (Overlaps with "data retention" on #1.)
2. **Who handles Reports and what the response SLA is**: Church Admin only, or escalation to the Platform Admin? What happens when the reported user is the Church Admin?
3. **Content filter**: build a simple word list or use a managed moderation API (for example AWS Comprehend)? This is a cost/ops trade-off.
4. **Store listing strategy**: public listing vs Apple Unlisted; Play personal vs organization developer account (D-U-N-S, closed-test requirement), and who the publisher of record is.
5. **Church Admin account deletion**: what happens to a Church whose last Church Admin deletes their account?
