# Push notification options across iOS, Android, and web

Research for [#7](https://github.com/llogan382/prayerteam/issues/7). Sources were checked on 2026-11-25. Each claim cites the primary source that owns it.

## Answer

- **iOS and Android: use Expo Push Service.** It's free, it covers both platforms behind one HTTP API and one token type, and EAS stores the APNs key and FCM credentials. Direct APNs/FCM, or SNS on top of them, would add credential handling, JWT signing, and per-platform error handling for no cost benefit at this scale.
- **Web: Expo push doesn't cover the web build.** `expo-notifications` push APIs are Android/iOS only. Web needs standard W3C Web Push (service worker + VAPID), sent from the Node API with a library such as `web-push`. The other option is FCM's JS SDK.
- **iOS Safari limits:** web push works only on iOS/iPadOS 16.4+, and only after the user adds the web app to the Home Screen. It also needs a manifest, a user-gesture permission prompt, and a visible notification for every push. In practice, iOS users should get push from the native app, and web push is mainly for desktop browsers and Android browsers.
- **Result:** the backend needs two send paths: Expo (native) and Web Push (browsers). They share one `push_subscriptions`-style table with a platform discriminator.

## Options compared (native iOS/Android)

| | Expo Push Service | Direct APNs + FCM | AWS SNS mobile push |
|---|---|---|---|
| Cost | Free ([Expo FAQ](https://docs.expo.dev/push-notifications/faq/)) | APNs: included with the Apple Developer Program. FCM: "No-cost" on Spark and Blaze ([Firebase pricing](https://firebase.google.com/pricing)) | Free tier: "1 million publishes, plus 1 million mobile push deliveries" per month ([SNS FAQ](https://aws.amazon.com/sns/faqs/)). Paid rate not stated on FAQ (see open questions) |
| Credentials | APNs key + FCM V1 service-account key, uploaded to/managed by EAS (`eas credentials`) ([Expo setup](https://docs.expo.dev/push-notifications/push-notifications-setup/)). Optional Expo access token for sending | APNs `.p8` signing key + Key ID + Team ID; ES256 JWT refreshed every 20–60 min ([Apple: token-based connection](https://developer.apple.com/documentation/usernotifications/establishing-a-token-based-connection-to-apns)). FCM HTTP v1 service account | Same APNs/FCM credentials, stored in an SNS "platform application"; each device becomes an SNS "platform endpoint" ([SNS mobile push](https://docs.aws.amazon.com/sns/latest/dg/sns-mobile-application-as-subscriber.html)) |
| Token on device | `ExpoPushToken` via `getExpoPushTokenAsync` | Native token via `getDevicePushTokenAsync` ([expo-notifications](https://docs.expo.dev/versions/latest/sdk/notifications/)) | Native token, registered as an endpoint |
| Delivery feedback | Push tickets (sync) then push receipts (poll ~15 min later, kept 24 h) | Synchronous HTTP response per request (APNs `410 Unregistered`, FCM `UNREGISTERED`) | CloudWatch delivery-status logging + event notifications for endpoint updates/deletes/failures ([SNS best practices](https://docs.aws.amazon.com/sns/latest/dg/mobile-push-notifications-best-practices.html)) |
| Web push | No | FCM yes (JS SDK); APNs no (Safari uses standard Web Push) | No: supports ADM, APNs, Baidu, FCM, WNS only ([SNS mobile push](https://docs.aws.amazon.com/sns/latest/dg/sns-mobile-application-as-subscriber.html)) |
| Ops load (solo dev) | Lowest | Highest | Medium: AWS-native, but endpoint de-dupe and enable/disable management fall on you |

## Expo Push Service details

- **Sending:** `POST https://exp.host/--/api/v2/push/send` with up to 100 messages per request. Rate limit is 600 notifications/sec per project. `expo-server-sdk-node` handles throttling and retry ([Sending notifications](https://docs.expo.dev/push-notifications/sending-notifications/)).
- **Security:** sending needs no auth by default, so a leaked token lets anyone push to that device. Enable "enhanced push security" in the Expo dashboard and pass an access token as `Authorization: Bearer` (server SDK ≥ 3.6.0) ([Sending notifications](https://docs.expo.dev/push-notifications/sending-notifications/)). **Recommendation: turn this on.**
- **Delivery receipts:** a ticket only means Expo accepted the message. A receipt says whether APNs/FCM accepted it. Fetch receipts with `POST /--/api/v2/push/getReceipts` (≤1,000 IDs) about 15 minutes after sending. Receipts are cleared after 24 hours. Neither a ticket nor a receipt confirms the notification reached the device ([Sending notifications](https://docs.expo.dev/push-notifications/sending-notifications/)).
- **Errors to handle:** `DeviceNotRegistered` (stop sending to that token), `MessageRateExceeded`, `MessageTooBig` (>4096 bytes), `InvalidCredentials`, `MismatchSenderId` ([Sending notifications](https://docs.expo.dev/push-notifications/sending-notifications/)).
- **Token lifecycle:** the `ExpoPushToken` survives app upgrades. On iOS it also survives reinstall, and on Android a reinstall may change it. It changes if the applicationId/experienceId changes. It never expires, and uninstalled apps show up as `DeviceNotRegistered` ([Expo FAQ](https://docs.expo.dev/push-notifications/faq/)). The `addPushTokenListener` callback reports rotation while the app runs ([expo-notifications](https://docs.expo.dev/versions/latest/sdk/notifications/)).
- **Reliability and privacy:** delivery is best-effort and at-least-once, so duplicates or misses are rare but possible. Notification contents stay in memory and queues only, never in a database ([Expo FAQ](https://docs.expo.dev/push-notifications/faq/)). Prayer Request text is sensitive, so consider short payloads like "New prayer request in <Team>" rather than full request bodies.
- **Dev workflow:** SDK 53+ Expo Go doesn't support push, so testing needs a development build. A paid Apple Developer account is required for iOS credentials ([Expo FAQ](https://docs.expo.dev/push-notifications/faq/), [Expo setup](https://docs.expo.dev/push-notifications/push-notifications-setup/)). The project already requires the owner's Apple developer credentials.
- **Lock-in:** low. `getDevicePushTokenAsync` returns native APNs/FCM tokens, so a later move to direct APNs/FCM or SNS only changes the token type stored and the sender ([Expo FAQ](https://docs.expo.dev/push-notifications/faq/)).

## Direct APNs / FCM details (for reference, or for a later migration)

- **APNs auth:** a `.p8` signing key and 10-char Key ID, plus the Team ID as `iss`, ES256 only. Refresh the token no more than once per 20 min and at least hourly. `ExpiredProviderToken` (403) comes back if `iat` is more than 1 h old, and `TooManyProviderTokenUpdates` (429) if you refresh too often. Team-scoped keys are now environment-restricted (Sandbox or Production, max 2 per environment) ([Apple: token-based connection](https://developer.apple.com/documentation/usernotifications/establishing-a-token-based-connection-to-apns)).
- **APNs feedback:** each request gets a synchronous status. `410` with `Unregistered`/`ExpiredToken` means stop sending to that token. `BadDeviceToken` can mean a sandbox/production mismatch ([Apple: handling responses](https://developer.apple.com/documentation/usernotifications/handling-notification-responses-from-apns)).
- **FCM token hygiene:** store a timestamp with each token and refresh it about monthly (weekly or more often gains nothing). By default FCM treats a token as stale after 1 month inactive. Android tokens inactive for 270 days expire. iOS has no such expiry, so prune iOS tokens yourself. Delete tokens on `UNREGISTERED` (404), and on `INVALID_ARGUMENT` (400) only when you're sure the payload is valid ([FCM manage tokens](https://firebase.google.com/docs/cloud-messaging/manage-tokens)). These practices also apply to Expo tokens. A `last_seen_at` column plus a pruning job is cheap insurance.

## Web push (the web build)

- **Standards:** W3C Push API + Notifications API + Service Worker. The client calls `PushManager.subscribe()` from a service worker and receives a `PushSubscription` (endpoint + encryption keys) to store server-side. The endpoint is a capability URL, so keep it secret and CSRF-protect the subscribe route. Handle `pushsubscriptionchange` to re-subscribe. Baseline "widely available" since March 2023 ([MDN Push API](https://developer.mozilla.org/en-US/docs/Web/API/Push_API)).
- **Server side:** VAPID key pair. Payloads are encrypted per RFC 8291 and sent over HTTP to whichever endpoint the browser gave you (Google, Mozilla, Apple, …). No vendor account is needed. The npm `web-push` library handles this from Node.
- **Alternative:** FCM's JS SDK (`firebase-messaging-sw.js` + VAPID key, HTTPS only) can deliver web push through the same FCM project ([FCM web client](https://firebase.google.com/docs/cloud-messaging/js/client)). This is only worth it if the backend was sending through FCM anyway. With Expo for native, plain `web-push` is simpler.
- **Expo:** `expo-notifications` marks `getExpoPushTokenAsync`, `getDevicePushTokenAsync` and `addPushTokenListener` as Android/iOS only ([expo-notifications](https://docs.expo.dev/versions/latest/sdk/notifications/)). The React Native Web build must call the browser APIs directly, e.g. in a `.web.ts` platform file, and ship its own service worker.

### Safari / iOS limits ([WebKit blog](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/), [Apple: web push](https://developer.apple.com/documentation/usernotifications/sending-web-push-notifications-in-web-apps-and-browsers))

- Supported in Home Screen web apps on iOS/iPadOS **16.4+** and in Safari 16 on macOS 13+. In iOS Safari tabs, web push is available only after the user does "Add to Home Screen".
- Needs a web app manifest with `display: standalone` or `fullscreen`.
- The permission request must come straight from a user gesture, such as a tap on a "Turn on notifications" button.
- **No silent pushes:** every push must show a notification right away, or Safari revokes permission.
- No Apple Developer Program membership is needed for web push. If server egress is restricted, allow `https://*.push.apple.com`.
- `TTL` header: Apple stores undelivered pushes for up to 30 days. The offline queue per device is limited. The payload limit is 4 KB. `410` means the subscription has expired. Don't refresh the VAPID JWT more often than once per hour.
- The Badging API (`navigator.setAppBadge`) works for Home Screen web apps.

## Cost summary

At Prayer Team's likely scale (small churches, thousands of notifications per month), every option is effectively **$0**: Expo push, FCM, APNs and standard Web Push are all free, and SNS is free up to 1M mobile push deliveries per month. The real cost differences are developer time and operational load, which favour Expo.

## Suggested shape for the spec (input to #13, not a decision)

- One table, e.g. `push_subscriptions(member_id, platform: 'expo' | 'webpush', token_or_endpoint, keys_json, created_at, last_seen_at)`. A Member can have many devices.
- Send through a queue or job (e.g. SQS + worker, or a Postgres-backed job) so request handlers never block on push. Fan out per Team.
- Poll Expo receipts in a delayed job, delete on `DeviceNotRegistered` / web push `404`/`410`, and prune by `last_seen_at`.
- Keep notification text minimal and privacy-safe, since lock screens are public.

## Open questions surfaced

1. **Notification rules** (which events notify whom, quiet hours, per-Team opt-out). This is for grilling ticket #13.
2. **Web PWA scope:** should the web build be an installable PWA (manifest + service worker)? iOS web push needs one, and that also touches the offline-behaviour item on the map.
3. **Payload privacy:** how much Prayer Request content may appear in a notification? This links to the privacy policy item.
4. **SNS paid rate:** the AWS pricing page didn't render a per-million mobile push price for verification. It only matters if SNS is chosen, which this note doesn't recommend.
5. **Background job runner on AWS:** the Expo receipt polling and fan-out need one, and the choice should match the hosting decision.
