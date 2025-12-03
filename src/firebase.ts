// Firebase Configuration for Zawoja System
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, doc, setDoc, getDoc, getDocs, updateDoc, deleteDoc, query, where, orderBy, Timestamp } from 'firebase/firestore';
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged } from 'firebase/auth';

// WAŻNE: Zamień te dane na swoje z Firebase Console
// 1. Idź na: https://console.firebase.google.com
// 2. Wybierz projekt (lub utwórz nowy)
// 3. Ustawienia projektu → Twoje aplikacje → Web → Konfiguracja
const firebaseConfig = {
  apiKey: "AIzaSyCclES1Y5ptbJ4rTIEGv1GiN7deewuYtXc",
  authDomain: "ospzawoja-467db.firebaseapp.com",
  projectId: "ospzawoja-467db",
  storageBucket: "ospzawoja-467db.firebasestorage.app",
  messagingSenderId: "101630450070",
  appId: "1:101630450070:web:8befaa46dbb20972b365b7",
  measurementId: "G-E8Q1WHKKY7"
};


// Inicjalizacja Firebase
const app = initializeApp(firebaseConfig);

// Inicjalizacja Firestore Database
export const db = getFirestore(app);

// Inicjalizacja Authentication
export const auth = getAuth(app);

// Kolekcje w bazie
export const COLLECTIONS = {
  ROADS: 'roads',
  USERS: 'users',
  ACTIVITY_LOGS: 'activity_logs',
  CRISIS_POINTS: 'crisis_points'
};

// ===== OPERACJE NA DROGACH =====

export const saveRoad = async (road: any) => {
  try {
    const roadRef = doc(db, COLLECTIONS.ROADS, road.id.toString());
    await setDoc(roadRef, {
      ...road,
      lastUpdate: new Date().toISOString()
    });
    console.log('Droga zapisana:', road.id);
    return true;
  } catch (error) {
    console.error('Błąd zapisu drogi:', error);
    return false;
  }
};

export const getRoads = async () => {
  try {
    const roadsSnapshot = await getDocs(collection(db, COLLECTIONS.ROADS));
    const roads = roadsSnapshot.docs.map(doc => ({
      id: parseInt(doc.id),
      ...doc.data()
    }));
    console.log('Pobrano dróg:', roads.length);
    return roads;
  } catch (error) {
    console.error('Błąd pobierania dróg:', error);
    return [];
  }
};

export const updateRoad = async (roadId: number, updates: any) => {
  try {
    const roadRef = doc(db, COLLECTIONS.ROADS, roadId.toString());
    await updateDoc(roadRef, {
      ...updates,
      lastUpdate: new Date().toISOString()
    });
    console.log('Droga zaktualizowana:', roadId);
    return true;
  } catch (error) {
    console.error('Błąd aktualizacji drogi:', error);
    return false;
  }
};

export const deleteRoad = async (roadId: number) => {
  try {
    await deleteDoc(doc(db, COLLECTIONS.ROADS, roadId.toString()));
    console.log('Droga usunięta:', roadId);
    return true;
  } catch (error) {
    console.error('Błąd usuwania drogi:', error);
    return false;
  }
};

// ===== OPERACJE NA UŻYTKOWNIKACH =====

export const saveUser = async (user: any) => {
  try {
    const userRef = doc(db, COLLECTIONS.USERS, user.id);
    await setDoc(userRef, {
      ...user,
      createdAt: user.createdAt || new Date().toISOString()
    });
    console.log('Użytkownik zapisany:', user.username);
    return true;
  } catch (error) {
    console.error('Błąd zapisu użytkownika:', error);
    return false;
  }
};

export const getUsers = async () => {
  try {
    const usersSnapshot = await getDocs(collection(db, COLLECTIONS.USERS));
    const users = usersSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    console.log('Pobrano użytkowników:', users.length);
    return users;
  } catch (error) {
    console.error('Błąd pobierania użytkowników:', error);
    return [];
  }
};

export const updateUser = async (userId: string, updates: any) => {
  try {
    const userRef = doc(db, COLLECTIONS.USERS, userId);
    await updateDoc(userRef, updates);
    console.log('Użytkownik zaktualizowany:', userId);
    return true;
  } catch (error) {
    console.error('Błąd aktualizacji użytkownika:', error);
    return false;
  }
};

export const deleteUser = async (userId: string) => {
  try {
    await deleteDoc(doc(db, COLLECTIONS.USERS, userId));
    console.log('Użytkownik usunięty:', userId);
    return true;
  } catch (error) {
    console.error('Błąd usuwania użytkownika:', error);
    return false;
  }
};

// ===== OPERACJE NA LOGACH =====

export const addActivityLog = async (log: any) => {
  try {
    const logRef = doc(collection(db, COLLECTIONS.ACTIVITY_LOGS));
    await setDoc(logRef, {
      ...log,
      timestamp: new Date().toISOString()
    });
    console.log('Log dodany');
    return true;
  } catch (error) {
    console.error('Błąd zapisu logu:', error);
    return false;
  }
};

export const getActivityLogs = async (limit: number = 100) => {
  try {
    const logsSnapshot = await getDocs(
      query(
        collection(db, COLLECTIONS.ACTIVITY_LOGS),
        orderBy('timestamp', 'desc')
      )
    );
    const logs = logsSnapshot.docs.slice(0, limit).map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    console.log('Pobrano logów:', logs.length);
    return logs;
  } catch (error) {
    console.error('Błąd pobierania logów:', error);
    return [];
  }
};

// ===== INICJALIZACJA DANYCH =====

export const initializeDefaultData = async (initialRoads: any[], defaultUser: any) => {
  try {
    // Sprawdź czy są już dane
    const roadsSnapshot = await getDocs(collection(db, COLLECTIONS.ROADS));
    
    if (roadsSnapshot.empty) {
      console.log('Inicjalizacja domyślnych danych...');
      
      // Dodaj drogi
      for (const road of initialRoads) {
        await saveRoad(road);
      }
      
      // Dodaj domyślnego użytkownika
      await saveUser(defaultUser);
      
      console.log('Domyślne dane zainicjalizowane!');
      return true;
    } else {
      console.log('Dane już istnieją w bazie');
      return false;
    }
  } catch (error) {
    console.error('Błąd inicjalizacji danych:', error);
    return false;
  }
};

export default app;
