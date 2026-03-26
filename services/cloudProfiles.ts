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

// Obtener o crear el perfil de usuario en la nube
export const loadCloudProfile = async (uid: string): Promise<UserCloudProfile> => {
  const { doc, getDoc, setDoc } = await import('firebase/firestore');
  const userRef = doc(db, 'users', uid);
  const snap = await getDoc(userRef);
  if (snap.exists()) {
    return snap.data() as UserCloudProfile;
  } else {
    await setDoc(userRef, DEFAULT_PROFILE);
    return DEFAULT_PROFILE;
  }
};

// Actualizar un campo específico del perfil del usuario (merge)
export const updateCloudProfile = async (uid: string, data: Partial<UserCloudProfile>): Promise<void> => {
  const { doc, setDoc } = await import('firebase/firestore');
  const userRef = doc(db, 'users', uid);
  await setDoc(userRef, data, { merge: true });
};

// Escuchar cambios en la nube en tiempo real (opcional para mantener sincronizado en multi-ventana)
export const subscribeToCloudProfile = (uid: string, callback: (data: UserCloudProfile) => void) => {
  import('firebase/firestore').then(({ doc, onSnapshot }) => {
    const userRef = doc(db, 'users', uid);
    return onSnapshot(userRef, (docSnap) => {
      if (docSnap.exists()) {
        callback(docSnap.data() as UserCloudProfile);
      }
    });
  });
};
