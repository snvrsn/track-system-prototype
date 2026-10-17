import { initializeApp } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js";
import {
  getDatabase,
  onValue,
  push,
  ref,
  remove,
  set,
  update,
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-database.js";
import { firebaseConfig } from "./firebase-config.js";

const collections = new Set(["deadlines", "reminders"]);

function getCollectionRef(database, collection) {
  if (!collections.has(collection)) {
    throw new Error(`Unknown shared collection: ${collection}`);
  }
  return ref(database, `shared/${collection}`);
}

function createLegacyKey(collection, item) {
  const { id, ...record } = item;
  const serialized = JSON.stringify({ collection, id, record });
  const bytes = new TextEncoder().encode(serialized);

  return crypto.subtle.digest("SHA-256", bytes).then((digest) => {
    const hash = Array.from(new Uint8Array(digest), (byte) =>
      byte.toString(16).padStart(2, "0"),
    ).join("");
    return { key: `legacy_${hash}`, record };
  });
}

export function createSharedStore() {
  const requiredConfig = [
    firebaseConfig.apiKey,
    firebaseConfig.authDomain,
    firebaseConfig.databaseURL,
    firebaseConfig.projectId,
    firebaseConfig.appId,
  ];
  if (requiredConfig.some((value) => !value || value.includes("PASTE_"))) {
    throw new Error(
      "Shared sync is not configured yet. Follow the steps in FIREBASE_SETUP.md.",
    );
  }

  const app = initializeApp(firebaseConfig);
  const database = getDatabase(app);

  return {
    watch(collection, onItems, onError) {
      return onValue(
        getCollectionRef(database, collection),
        (snapshot) => {
          const records = snapshot.val() || {};
          const items = Object.entries(records).map(([id, record]) => ({
            ...record,
            id,
          }));
          onItems(items);
        },
        onError,
      );
    },

    async add(collection, item) {
      const itemRef = push(getCollectionRef(database, collection));
      await set(itemRef, item);
      return itemRef.key;
    },

    update(collection, id, changes) {
      getCollectionRef(database, collection);
      return update(ref(database, `shared/${collection}/${id}`), changes);
    },

    delete(collection, id) {
      getCollectionRef(database, collection);
      return remove(ref(database, `shared/${collection}/${id}`));
    },

    async importLegacy(collection, items) {
      const marker = `track-shared-imported-${firebaseConfig.projectId}-${collection}-v1`;
      if (localStorage.getItem(marker) === "true") return 0;

      for (const item of items) {
        const { key, record } = await createLegacyKey(collection, item);
        await set(ref(database, `shared/${collection}/${key}`), record);
      }

      localStorage.setItem(marker, "true");
      return items.length;
    },
  };
}
