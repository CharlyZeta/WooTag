import { doc, setDoc, onSnapshot, arrayUnion, updateDoc, getDoc } from 'firebase/firestore';
import { db } from './firebase';
import { Product, AuthSession } from '../types';

export interface RoomSession {
  roomId: string; // Generado por la PC
  wooSession: AuthSession; // Credentials de WOO que el móvil va a heredar
  products: Product[]; // Los productos sincronizados en la lista
  hostUid: string; // Quien creó la sala
  createdAt: number;
}

// 1. Host (PC): Crea una sala y empieza a escuchar cambios
export const createRoom = async (hostUid: string, wooSession: AuthSession): Promise<string> => {
  const roomId = Math.random().toString(36).substring(2, 8).toUpperCase(); // ej: A7B9F1
  const roomRef = doc(db, 'rooms', roomId);
  
  await setDoc(roomRef, {
    roomId,
    wooSession,
    products: [],
    hostUid,
    createdAt: Date.now()
  } as RoomSession);
  
  return roomId;
};

// 2. Mobile / Host: Escuchar cambios en la sala en tiempo real
export const subscribeToRoom = (roomId: string, callback: (room: RoomSession | null) => void) => {
  const roomRef = doc(db, 'rooms', roomId);
  return onSnapshot(roomRef, (snapshot) => {
    if (snapshot.exists()) {
      callback(snapshot.data() as RoomSession);
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

// 6. Mobile: Join Room (Obtiene config inicial)
export const joinRoom = async (roomId: string): Promise<RoomSession | null> => {
  const roomRef = doc(db, 'rooms', roomId);
  const snap = await getDoc(roomRef);
  if (snap.exists()) {
    return snap.data() as RoomSession;
  }
  return null;
};
