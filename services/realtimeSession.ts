import { doc, setDoc, onSnapshot, arrayUnion, updateDoc, getDoc } from 'firebase/firestore';
import { db } from './firebase';
import { Product, AuthSession } from '../types';
import { encryptSecret, decryptSecret } from '../utils/crypto';

export interface RoomSession {
  roomId: string; // Generado por la PC
  wooSession: AuthSession; // Credentials de WOO que el móvil va a heredar
  products: Product[]; // Los productos sincronizados en la lista
  hostUid: string; // Quien creó la sala
  createdAt: number;
  guestJoined?: boolean; // Feedback para que la PC sepa que el móvil se conectó
}

async function decryptRoomSession(data: RoomSession, roomId: string): Promise<RoomSession> {
  const cloned: RoomSession = JSON.parse(JSON.stringify(data));
  if (cloned.wooSession?.config) {
    if (cloned.wooSession.config.consumerKey) {
      cloned.wooSession.config.consumerKey = await decryptSecret(cloned.wooSession.config.consumerKey, roomId);
    }
    if (cloned.wooSession.config.consumerSecret) {
      cloned.wooSession.config.consumerSecret = await decryptSecret(cloned.wooSession.config.consumerSecret, roomId);
    }
  }
  return cloned;
}

// 1. Host (PC): Crea una sala y empieza a escuchar cambios
export const createRoom = async (hostUid: string, wooSession: AuthSession, initialProducts: Product[] = []): Promise<string> => {
  // FIX-0002: Genera un ID criptográfico con 128 bits de entropía (base64url safe)
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const roomId = btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const roomRef = doc(db, 'rooms', roomId);
  
  // FIX-0003: Cifrar credenciales antes de persistir en Firestore
  const encryptedWooSession: AuthSession = JSON.parse(JSON.stringify(wooSession));
  if (encryptedWooSession.config) {
    if (encryptedWooSession.config.consumerKey) {
      encryptedWooSession.config.consumerKey = await encryptSecret(encryptedWooSession.config.consumerKey, roomId);
    }
    if (encryptedWooSession.config.consumerSecret) {
      encryptedWooSession.config.consumerSecret = await encryptSecret(encryptedWooSession.config.consumerSecret, roomId);
    }
  }

  await setDoc(roomRef, {
    roomId,
    wooSession: encryptedWooSession,
    products: initialProducts,
    hostUid,
    createdAt: Date.now(),
    guestJoined: false // Inicializar explícitamente
  } as RoomSession);
  
  return roomId;
};

// 2. Mobile / Host: Escuchar cambios en la sala en tiempo real
export const subscribeToRoom = (roomId: string, callback: (room: RoomSession | null) => void) => {
  const roomRef = doc(db, 'rooms', roomId);
  return onSnapshot(roomRef, async (snapshot) => {
    if (snapshot.exists()) {
      const raw = snapshot.data() as RoomSession;
      const decrypted = await decryptRoomSession(raw, roomId);
      callback(decrypted);
    } else {
      callback(null); // La sala fue cerrada
    }
  });
};

// 3. Mobile / Host: Agregar un producto a la sala 
// (Esto inmediatamente se le notificará a la PC por el onSnapshot)
export const addProductToRoom = async (roomId: string, product: Product) => {
  const roomRef = doc(db, 'rooms', roomId);
  // Re-id to guarantee absolute uniqueness on firestore arrayUnion if same product is scanned twice
  const uniqueProduct = { ...product, id: `${product.id}-${Date.now()}` };
  await updateDoc(roomRef, {
    products: arrayUnion(uniqueProduct)
  });
};

// 4. Host (PC): Sincronizar (sobrescribir) la lista de la sala si el Host elimina o procesa cosas
export const syncRoomProducts = async (roomId: string, products: Product[]) => {
  const roomRef = doc(db, 'rooms', roomId);
  await updateDoc(roomRef, { products });
};

// 5. Host (PC): Cerrar sala
export const closeRoom = async (roomId: string) => {
  const { deleteDoc } = await import('firebase/firestore');
  const roomRef = doc(db, 'rooms', roomId);
  await deleteDoc(roomRef);
};

// 6. Mobile: Join Room (Obtiene config inicial con descifrado)
export const joinRoom = async (roomId: string): Promise<RoomSession | null> => {
  const roomRef = doc(db, 'rooms', roomId);
  const snap = await getDoc(roomRef);
  if (snap.exists()) {
    const raw = snap.data() as RoomSession;
    const data = await decryptRoomSession(raw, roomId);
    // Notificar al host que nos unimos
    await updateDoc(roomRef, { guestJoined: true });
    return data;
  }
  return null;
};
