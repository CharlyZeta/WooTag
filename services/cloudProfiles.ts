import { doc, getDoc, setDoc, onSnapshot, updateDoc, arrayUnion } from 'firebase/firestore';
import { db } from './firebase';
import { DesignProfile, AuthSession, TagConfig, Product, WooSite } from '../types';
import { encryptSecret, decryptSecret } from '../utils/crypto';

export interface UserCloudProfile {
  wooSession: AuthSession | null;
  wooSites?: WooSite[];
  activeSiteId?: string | null;
  designProfiles: DesignProfile[];
  tagConfig: TagConfig | null;
  products: Product[];
  lastProductsDevice: string; // Device ID of last writer — prevents sync loops
}

async function encryptProfileCredentials(data: Partial<UserCloudProfile>, uid: string): Promise<Partial<UserCloudProfile>> {
  const cloned = JSON.parse(JSON.stringify(data));
  if (cloned.wooSession?.config) {
    if (cloned.wooSession.config.consumerKey) {
      cloned.wooSession.config.consumerKey = await encryptSecret(cloned.wooSession.config.consumerKey, uid);
    }
    if (cloned.wooSession.config.consumerSecret) {
      cloned.wooSession.config.consumerSecret = await encryptSecret(cloned.wooSession.config.consumerSecret, uid);
    }
  }
  if (Array.isArray(cloned.wooSites)) {
    for (const site of cloned.wooSites) {
      if (site.consumerKey) {
        site.consumerKey = await encryptSecret(site.consumerKey, uid);
      }
      if (site.consumerSecret) {
        site.consumerSecret = await encryptSecret(site.consumerSecret, uid);
      }
    }
  }
  return cloned;
}

async function decryptProfileCredentials(profile: UserCloudProfile, uid: string): Promise<UserCloudProfile> {
  const cloned = JSON.parse(JSON.stringify(profile));
  if (cloned.wooSession?.config) {
    if (cloned.wooSession.config.consumerKey) {
      cloned.wooSession.config.consumerKey = await decryptSecret(cloned.wooSession.config.consumerKey, uid);
    }
    if (cloned.wooSession.config.consumerSecret) {
      cloned.wooSession.config.consumerSecret = await decryptSecret(cloned.wooSession.config.consumerSecret, uid);
    }
  }
  if (Array.isArray(cloned.wooSites)) {
    for (const site of cloned.wooSites) {
      if (site.consumerKey) {
        site.consumerKey = await decryptSecret(site.consumerKey, uid);
      }
      if (site.consumerSecret) {
        site.consumerSecret = await decryptSecret(site.consumerSecret, uid);
      }
    }
  }
  return cloned;
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
    const raw = snap.data() as UserCloudProfile;
    return await decryptProfileCredentials(raw, uid);
  }
  await setDoc(userRef, DEFAULT_PROFILE);
  return DEFAULT_PROFILE;
};

/** Actualiza campos específicos del perfil del usuario usando merge y cifrado. */
export const updateCloudProfile = async (uid: string, data: Partial<UserCloudProfile>): Promise<void> => {
  const userRef = doc(db, 'users', uid);
  const securedData = await encryptProfileCredentials(data, uid);
  // Limpiar undefined values porque Firestore rechaza operaciones si hay propiedades con valor `undefined`.
  const safeData = JSON.parse(JSON.stringify(securedData));
  await setDoc(userRef, safeData, { merge: true });
};

/**
 * Suscribe a cambios en tiempo real del perfil del usuario con descifrado automático.
 * Retorna la función de cancelación de la suscripción.
 */
export const subscribeToCloudProfile = (
  uid: string,
  callback: (data: UserCloudProfile) => void
): (() => void) => {
  const userRef = doc(db, 'users', uid);
  return onSnapshot(userRef, async (docSnap) => {
    if (docSnap.exists()) {
      const raw = docSnap.data() as UserCloudProfile;
      const decrypted = await decryptProfileCredentials(raw, uid);
      callback(decrypted);
    }
  });
};
