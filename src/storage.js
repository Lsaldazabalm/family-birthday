// ─────────────────────────────────────────────────────────────
// storage.js — Firebase Storage para fotos y vouchers
// Sube imágenes y devuelve la URL pública permanente
// ─────────────────────────────────────────────────────────────

import { getStorage, ref, uploadString, getDownloadURL, deleteObject } from "firebase/storage";
import { db } from "./firebase";

const storage = getStorage();

// Convierte base64 dataURL → sube a Storage → devuelve URL pública
export async function uploadImage(base64DataUrl, path) {
  if (!base64DataUrl || !base64DataUrl.startsWith("data:")) return base64DataUrl;
  const storageRef = ref(storage, path);
  await uploadString(storageRef, base64DataUrl, "data_url");
  return await getDownloadURL(storageRef);
}

// Foto de perfil de un miembro
export async function uploadMemberPhoto(memberId, base64) {
  return await uploadImage(base64, `members/${memberId}/photo.jpg`);
}

// Foto de perfil del grupo
export async function uploadGroupPhoto(base64) {
  return await uploadImage(base64, `group/photo.jpg`);
}

// Voucher de pago
export async function uploadVoucher(paymentId, base64) {
  return await uploadImage(base64, `vouchers/${paymentId}.jpg`);
}
