const admin = require("firebase-admin");
const serviceAccount = require("./firebase_key.json"); // Get this from Firebase Console (Service Account)

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();
module.exports = { db };
