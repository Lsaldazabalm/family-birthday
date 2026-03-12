// ─────────────────────────────────────────────────────────────
// db.js — Capa de datos Firebase (reemplaza localStorage)
//
// Colecciones en Firestore:
//   /members       — integrantes
//   /payments      — pagos y coberturas
//   /wishes        — saludos del muro
//   /config        — perfil del grupo, aprobaciones pendientes
// ─────────────────────────────────────────────────────────────

import { db } from "./firebase";
import {
  collection, doc,
  getDocs, getDoc, setDoc, addDoc, updateDoc, deleteDoc,
  onSnapshot, query, orderBy, serverTimestamp,
  writeBatch,
} from "firebase/firestore";

// ── PIN: hash simple (no necesitamos criptografía fuerte para PIN de 4 dígitos) ──
export function hashPin(pin) {
  // djb2 hash → hex string
  let h = 5381;
  for (let i = 0; i < pin.length; i++) h = ((h << 5) + h) + pin.charCodeAt(i);
  return (h >>> 0).toString(16);
}

// ════════════════════════════════════════
// MEMBERS
// ════════════════════════════════════════

export async function getMembers() {
  const snap = await getDocs(collection(db, "members"));
  return snap.docs.map(d => ({ ...d.data(), id: d.id }));
}

export function subscribeMembers(callback) {
  return onSnapshot(
    query(collection(db, "members"), orderBy("createdAt", "asc")),
    snap => callback(snap.docs.map(d => ({ ...d.data(), id: d.id })))
  );
}

export async function addMember(form) {
  const data = {
    name:         form.name.trim(),
    phone:        form.phone.trim(),
    dob:          form.dob,
    photo:        form.photo || "",
    pinHash:      hashPin(form.pin),
    isAdmin:      form.isAdmin || false,
    participates: form.participates !== false,
    createdAt:    serverTimestamp(),
  };
  const ref = await addDoc(collection(db, "members"), data);
  return { ...data, id: ref.id };
}

export async function updateMember(id, fields) {
  const data = { ...fields };
  // Si viene pin en texto plano → hashear
  if (data.pin) { data.pinHash = hashPin(data.pin); delete data.pin; }
  await updateDoc(doc(db, "members", id), data);
}

export async function deleteMember(id) {
  await deleteDoc(doc(db, "members", id));
}

// ════════════════════════════════════════
// PAYMENTS
// ════════════════════════════════════════

export function subscribePayments(callback) {
  return onSnapshot(
    query(collection(db, "payments"), orderBy("date", "desc")),
    snap => callback(snap.docs.map(d => ({ ...d.data(), id: d.id })))
  );
}

export async function addPayment(payment) {
  const data = { ...payment, date: payment.date || new Date().toISOString(), createdAt: serverTimestamp() };
  const ref = await addDoc(collection(db, "payments"), data);
  return { ...data, id: ref.id };
}

export async function confirmPayment(id) {
  await updateDoc(doc(db, "payments", id), { confirmed: true });
}

export async function deletePaymentsByMember(memberId) {
  const snap = await getDocs(collection(db, "payments"));
  const batch = writeBatch(db);
  snap.docs.forEach(d => {
    const p = d.data();
    if (p.payerId === memberId || p.birthdayMemberId === memberId) {
      batch.delete(d.ref);
    }
  });
  await batch.commit();
}

// ════════════════════════════════════════
// WISHES
// ════════════════════════════════════════

export function subscribeWishes(callback) {
  return onSnapshot(
    query(collection(db, "wishes"), orderBy("date", "desc")),
    snap => callback(snap.docs.map(d => ({ ...d.data(), id: d.id })))
  );
}

export async function addWish(wish) {
  const data = { ...wish, date: wish.date || new Date().toISOString(), createdAt: serverTimestamp() };
  await addDoc(collection(db, "wishes"), data);
}

export async function reactToWish(wishId, emoji, userId) {
  const ref  = doc(db, "wishes", wishId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  const w         = snap.data();
  const reactions = { ...(w.reactions  || {}) };
  const reactedBy = { ...(w.reactedBy  || {}) };
  const users     = reactedBy[emoji]   || [];
  if (users.includes(userId)) {
    reactedBy[emoji] = users.filter(u => u !== userId);
    reactions[emoji] = Math.max(0, (reactions[emoji] || 1) - 1);
  } else {
    reactedBy[emoji] = [...users, userId];
    reactions[emoji] = (reactions[emoji] || 0) + 1;
  }
  await updateDoc(ref, { reactions, reactedBy });
}

// ════════════════════════════════════════
// CONFIG (perfil del grupo + aprobaciones)
// ════════════════════════════════════════

const CONFIG_DOC = "main";

export function subscribeConfig(callback) {
  return onSnapshot(doc(db, "config", CONFIG_DOC), snap => {
    callback(snap.exists() ? snap.data() : { groupProfile: { name:"Mi Grupo Familiar", desc:"", photo:"" }, pendingApprovals:[] });
  });
}

export async function updateGroupProfile(profile) {
  const ref = doc(db, "config", CONFIG_DOC);
  await setDoc(ref, { groupProfile: profile }, { merge: true });
}

export async function addPendingApproval(entry) {
  const ref  = doc(db, "config", CONFIG_DOC);
  const snap = await getDoc(ref);
  const prev = snap.exists() ? (snap.data().pendingApprovals || []) : [];
  await setDoc(ref, { pendingApprovals: [...prev, { ...entry, date: new Date().toISOString() }] }, { merge: true });
}

export async function dismissPendingApproval(index) {
  const ref  = doc(db, "config", CONFIG_DOC);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  const prev = snap.data().pendingApprovals || [];
  await updateDoc(ref, { pendingApprovals: prev.filter((_, i) => i !== index) });
}
