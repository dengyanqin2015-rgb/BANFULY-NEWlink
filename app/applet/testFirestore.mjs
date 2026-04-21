import { initializeApp } from 'firebase/app';
import { getFirestore, doc, getDocFromServer } from 'firebase/firestore';
import firebaseConfig from './firebase-applet-config.json' with { type: 'json' };

const app = initializeApp(firebaseConfig);
const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

async function test() {
  try {
    await getDocFromServer(doc(db, 'test', 'test'));
    console.log("Success");
  } catch (e) {
    console.error("Error:", e);
  }
}
test();
