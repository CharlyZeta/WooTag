import { doc, getDoc, setDoc, onSnapshot } from 'firebase/firestore';
import { db } from './firebase';
import { DesignProfile, AuthSession, TagConfig } from '../types';

export interface UserCloudProfile {
  wooSession: AuthSession | null;
  designProfiles: DesignProfile[];
  tagConfig: TagConfig | null;
}

const DEFAULT_PROFILE: UserCloudProfile = {
  wooSession: null,
  designProfiles: [],
  tagConfig: null,
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
  await setDoc(userRef, data, { merge: true });
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
