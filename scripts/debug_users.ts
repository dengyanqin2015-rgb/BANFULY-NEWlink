
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json' with { type: 'json' };

const app = initializeApp(firebaseConfig);
const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

async function check() {
  const snap = await getDocs(collection(db, 'users'));
  console.log(`Total users: ${snap.size}`);
  snap.forEach(doc => {
    const d = doc.data();
    console.log(`- ${d.username} (${d.email}) [${d.role}] company: ${d.companyId}`);
  });
}

check().catch(console.error);
