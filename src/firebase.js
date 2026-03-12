import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey:            "AIzaSyDz1xxMrqQKdOhZIZDczR5rMnlptwBXbAM",
  authDomain:        "family-birthday-df4b2.firebaseapp.com",
  projectId:         "family-birthday-df4b2",
  storageBucket:     "family-birthday-df4b2.appspot.com",
  messagingSenderId: "403505346642",
  appId:             "1:403505346642:web:8394237534c0662e01078b",
};

const app     = initializeApp(firebaseConfig);
export const db      = getFirestore(app);
export const storage = getStorage(app);
