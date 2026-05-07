import { doc, getDoc, setDoc, onSnapshot, updateDoc, arrayUnion } from 'firebase/firestore';
import { db } from './firebase';
import { DesignProfile, AuthSession, TagConfig, Product, WooSite } from '../types';

export interface UserCloudProfile {
  wooSession: AuthSession | null;
  wooSites?: WooSite[];
  activeSiteId?: string | null;
  designProfiles: DesignProfile[];
  tagConfig: TagConfig | null;
  products: Product[];
  lastProductsDevice: string; // Device ID of last writer — prevents sync loops
}

/**
 * Agrega un producto de forma atómica a la lista del usuario en la nube.
 * Evita condiciones de carrera donde un dispositivo pisa la lista de otro.
 */
export const addProductToCloudProfile = async (uid: string, product: Product, deviceId: string) => {
  const userRef = doc(db, 'users', uid);
  
  // Limpieza de campos undefined para Firestore
  const cleanProduct = JSON.parse(JSON.stringify(product), (_, v) => v === undefined ? null : v);
  // Re-id para garantizar unicidad absoluta en arrayUnion si el mismo SKU se escanea 2 veces
  const uniqueProduct = { ...cleanProduct, id: `${cleanProduct.id}-${Date.now()}` };

  await updateDoc(userRef, {
    products: arrayUnion(uniqueProduct),
    lastProductsDevice: deviceId
  });
};

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
