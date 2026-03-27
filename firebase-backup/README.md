# Firebase Backup

This folder keeps the Firebase setup for future migration from Supabase/local storage back to Firebase.

## Current Firebase project

- Project ID: `ajartivo`
- Auth domain: `ajartivo.firebaseapp.com`
- Storage bucket: `ajartivo.firebasestorage.app`
- Messaging sender ID: `185169143149`
- App ID: `1:185169143149:web:f2aa9ac9dd6e537461a664`
- Measurement ID: `G-RC3WMLTENN`

## What is saved here

- `project-config.json`: current web app Firebase settings
- `.firebaserc`: default Firebase project alias
- `firebase.json`: root Firebase CLI config
- `firestore.rules`: Firestore security rules backup
- `storage.rules`: Firebase Storage rules backup
- `web/firebase-config.template.js`: modular web SDK starter
- `web/legacy-firebase-config.js`: older namespaced SDK starter
- `functions/`: Cloud Functions backup for secure downloads and Razorpay flow
- `.env.example`: variables to remember when deploying functions

## If you switch later

1. Run `firebase login`
2. Run `firebase use ajartivo`
3. Copy the files you need from this folder into the project root
4. Add real secrets from `.env.example`
5. Deploy only the parts you want, for example:
   - `firebase deploy --only firestore:rules`
   - `firebase deploy --only storage`
   - `firebase deploy --only functions`
