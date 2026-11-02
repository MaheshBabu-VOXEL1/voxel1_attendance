# Android activity notifications

Implementation is prepared locally; Firebase setup, backend deployment, and a Play Store update are required to activate it.

Employees receive their task assignments/reassignments and existing leave decision notifications. All active managers and admins in the same organization receive assignments, employee-created tasks, task status changes (start, progress, stuck, done), task comments, check-ins and checkouts. Existing leave request routing is preserved. Notifications are created in database triggers even when the recipient's app is closed.

## Activate

1. In Firebase create/register Android app `com.voxel1.daily`. Put its downloaded `google-services.json` at `D:/Attendance/Voxel1_Daily_App/android/app/google-services.json`. Enable Firebase Cloud Messaging HTTP v1 API.
2. Create a Firebase service account with permission to send FCM messages. Store the complete JSON only as the Supabase Edge Function secret `FIREBASE_SERVICE_ACCOUNT`. Set a random `MOBILE_PUSH_CRON_SECRET` there too. Never put the service account key in the website, APK, repository or chat.
3. Apply `supabase/migrations/0100_mobile_notifications.sql` to the production database. Deploy `deliver-mobile-push` with `supabase functions deploy deliver-mobile-push --no-verify-jwt`. It validates `x-push-secret` itself; ordinary user JWTs cannot invoke delivery.
4. Enable pg_cron, pg_net and Vault. Store the function URL and matching cron secret in Vault as `mobile_push_url` and `mobile_push_cron_secret`. Run `scripts/setup-mobile-push.sql` once. Delivery runs every minute, with retries after five minutes, up to eight attempts. Inspect exhausted rows in `mobile_push_queue`; after fixing the cause, reset their attempts and available_at to retry. Delivery is at least once; Android uses notification ID as its tray tag to limit duplicate tray entries.
5. Build and deploy the website (`npm run build`). In the wrapper run `npm run sync`, then build the signed release AAB using the existing release process. Version 1.0.4 / code 5 is reserved locally; choose a higher code if Play already has code 5. Upload and roll out the new release.
6. Employees and managers must install the update, sign in and allow notifications. Verify with two physical phones: assignment, reassignment, leave approval/rejection, each task status, comment, check-in and checkout, with the receiving app both open and closed. Verify sign-out and switching accounts on a shared phone; verify a manager in another organization receives nothing.

Notifications use the Android channel `voxel1_activity`. Users can mute it in Android settings. Tapping opens the signed-in dashboard. No historical alerts are pushed to newly registered devices. Expired FCM tokens are removed. Explicit sign-out removes the account's device registration before ending the session and clears delivered notifications. A network failure during this removal asks the user to retry sign-out. Background delivery depends on Android/FCM and user settings; force-stopped apps may require reopening.

## References

- https://capacitorjs.com/docs/apis/push-notifications
- https://firebase.google.com/docs/cloud-messaging/send/v1-api
