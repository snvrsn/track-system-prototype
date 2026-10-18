import {
  onValue,
  push,
  ref,
  remove,
  set,
  update,
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-database.js";
import { database } from "./firebase-app.js";
import { firebaseConfig } from "./firebase-config.js";

const collections = new Set(["deadlines", "reminders"]);

export function getSubjectList(record, subjectColors) {
  const value = record.subjects ?? record.subject;
  const subjects = Array.isArray(value)
    ? value
    : value && typeof value === "object"
      ? Object.keys(value).filter((subject) => value[subject] === true)
      : typeof value === "string"
        ? [value]
        : [];
  return [...new Set(subjects.filter((subject) => Object.hasOwn(subjectColors, subject)))];
}

export function getSubjectMap(subjects) {
  return Object.fromEntries(subjects.map((subject) => [subject, true]));
}

export function getSubjectBackground(subjects, subjectColors, rainbowBands) {
  if (subjects.length === 1) return subjectColors[subjects[0]];
  const bands = subjects.flatMap((subject) =>
    subject === "HOMEROOM" ? rainbowBands : [subjectColors[subject]],
  );
  const stops = bands.map((color, index) => {
    const start = (index / bands.length) * 100;
    const end = ((index + 1) / bands.length) * 100;
    return `${color} ${start}% ${end}%`;
  });
  return `linear-gradient(90deg, ${stops.join(", ")})`;
}

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
  const legacySubjects = Array.isArray(record.subjects)
    ? record.subjects
    : record.subjects && typeof record.subjects === "object"
      ? Object.keys(record.subjects).filter((subject) => record.subjects[subject] === true)
      : typeof record.subject === "string"
        ? [record.subject]
        : [];
  const normalizedRecord = {
    ...record,
    subjects: Object.fromEntries(legacySubjects.map((subject) => [subject, true])),
  };
  delete normalizedRecord.subject;

  return crypto.subtle.digest("SHA-256", bytes).then((digest) => {
    const hash = Array.from(new Uint8Array(digest), (byte) =>
      byte.toString(16).padStart(2, "0"),
    ).join("");
    return { key: `legacy_${hash}`, record: normalizedRecord };
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
      const marker = `track-shared-imported-${firebaseConfig.projectId}-${collection}-v2`;
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
