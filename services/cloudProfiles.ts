import { doc, getDoc, setDoc, onSnapshot } from 'firebase/firestore';
import { db } from './firebase';
import { DesignProfile, AuthSession, TagConfig, Product } from '../types';

export interface UserCloudProfile {
  wooSession: AuthSession | null;
  designProfiles: DesignProfile[];
  tagConfig: TagConfig | null;
  products: Product[];
  lastProductsDevice: string; // Device ID of last writer — prevents sync loops
}

const DEFAULT_PROFILE: UserCloudProfile = {
  wooSession: null,
  designProfiles: [],
  tagConfig: null,
  products: [],
  lastProductsDevice: '',
};

/** Obtiene o crea el perfil de usuario en la nube. */
export const loadCloudProfile = async (uid: string): Promise<UserCloudProfile> => {
  const userRef = doc(db, 'users', uid);
  const snap = await getDoc(userRef);
  if (snap.exists()) {
    return snap.data() as UserCloudProfile;
  }
  await setDoc(userRef, DEFAULT_PROFILE);
  return DEFAULT_PROFILE;
};

/** Actualiza campos específicos del perfil del usuario usando merge. */
export const updateCloudProfile = async (uid: string, data: Partial<UserCloudProfile>): Promise<void> => {
  const userRef = doc(db, 'users', uid);
  // Limpiar undefined values porque Firestore rechaza operaciones si hay propiedades con valor `undefined`.
  // Usamos JSON parse/stringify como método rápido y seguro para purgar undefined fields de objetos y arrays.
  const safeData = JSON.parse(JSON.stringify(data));
  await setDoc(userRef, safeData, { merge: true });
};

/**
 * Suscribe a cambios en tiempo real del perfil del usuario.
 * Retorna la función de cancelación de la suscripción.
 */
export const subscribeToCloudProfile = (
  uid: string,
  callback: (data: UserCloudProfile) => void
): (() => void) => {
  const userRef = doc(db, 'users', uid);
  return onSnapshot(userRef, (docSnap) => {
    if (docSnap.exists()) {
      callback(docSnap.data() as UserCloudProfile);
    }
  });
};
