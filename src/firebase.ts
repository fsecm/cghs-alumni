import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  type User,
  type Auth
} from 'firebase/auth';
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  collection,
  query,
  where,
  limit,
  getDocs,
  startAfter,
  type QueryDocumentSnapshot,
  type DocumentData,
  type QueryConstraint,
  type Firestore
} from 'firebase/firestore';

export const PAGE_SIZE = 20;

export interface UserProfile {
  uid: string;
  name: string;
  nameLower?: string;
  batch: string;
  currentCity: string;
  jobOrStudy: string;
  status: 'pending' | 'approved' | 'rejected';
  updatedAt?: string;
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null,
  currentAuth?: Auth | null
) {
  const currentUser = currentAuth?.currentUser;
  const anyErr = error as any;
  const code = anyErr?.code;
  let rawMsg = anyErr?.message || String(error);
  if (typeof rawMsg === 'string') {
    rawMsg = rawMsg.replace(/^FirebaseError:\s*/, '');
  }
  const formattedError = code && !rawMsg.includes(code) ? `${code}: ${rawMsg}` : rawMsg;

  const errInfo: FirestoreErrorInfo = {
    error: formattedError,
    operationType,
    path,
    authInfo: {
      userId: currentUser?.uid,
      email: currentUser?.email,
      emailVerified: currentUser?.emailVerified,
      isAnonymous: currentUser?.isAnonymous,
      tenantId: currentUser?.tenantId,
      providerInfo: currentUser?.providerData?.map((p) => ({
        providerId: p.providerId,
        email: p.email,
      })) || [],
    },
  };
  console.error('Firestore Error:', JSON.stringify(errInfo));
  const errToThrow: any = new Error(formattedError);
  if (code) errToThrow.code = code;
  throw errToThrow;
}

// HARDCODED FIREBASE CONFIG
const firebaseConfig = {
  apiKey: "AIzaSyDPLKq8eC19pixCyZhgJO4efeJZsSZ2MQk",
  authDomain: "cghs-alumni.firebaseapp.com",
  projectId: "cghs-alumni",
  storageBucket: "cghs-alumni.firebasestorage.app",
  messagingSenderId: "1034787810470",
  appId: "1:1034787810470:web:06582ca9788f3d53fc9867"
};

const app: FirebaseApp = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);

export const auth: Auth = getAuth(app);
export const db: Firestore = getFirestore(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

export function subscribeToAuth(callback: (user: User | null) => void): () => void {
  return onAuthStateChanged(auth, callback);
}

export async function loginWithGoogle(): Promise<User> {
  const result = await signInWithPopup(auth, googleProvider);
  return result.user;
}

export async function logoutUser(): Promise<void> {
  await signOut(auth);
}

export async function fetchProfile(uid: string): Promise<UserProfile | null> {
  const docPath = `users/${uid}`;
  try {
    const docRef = doc(db, 'users', uid);
    const snapshot = await getDoc(docRef);
    if (snapshot.exists()) {
      return snapshot.data() as UserProfile;
    }
    return null;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, docPath, auth);
    return null;
  }
}

export async function saveProfile(profile: {
  uid: string;
  name: string;
  batch: string;
  currentCity: string;
  jobOrStudy: string;
  status?: 'pending' | 'approved' | 'rejected';
}): Promise<UserProfile> {
  const docPath = `users/${profile.uid}`;
  const docRef = doc(db, 'users', profile.uid);

  let finalStatus: 'pending' | 'approved' | 'rejected' = profile.status || 'pending';

  if (!profile.status) {
    try {
      const existingSnap = await getDoc(docRef);
      if (existingSnap.exists()) {
        const existingData = existingSnap.data();
        if (existingData?.status) {
          finalStatus = existingData.status;
        }
      }
    } catch {
      // If reading fails or doc doesn't exist, keep 'pending'
    }
  }

  const trimmedName = profile.name.trim();
  const payload: UserProfile = {
    uid: profile.uid,
    name: trimmedName,
    nameLower: trimmedName.toLowerCase(),
    batch: profile.batch,
    currentCity: profile.currentCity,
    jobOrStudy: profile.jobOrStudy,
    status: finalStatus,
    updatedAt: new Date().toISOString(),
  };

  try {
    await setDoc(docRef, payload);
    return payload;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, docPath, auth);
    throw error;
  }
}

export async function checkIsAdmin(uid: string): Promise<boolean> {
  const docPath = `admins/${uid}`;
  try {
    const adminDocRef = doc(db, 'admins', uid);
    const snap = await getDoc(adminDocRef);
    return snap.exists();
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, docPath, auth);
    return false;
  }
}

export async function fetchPendingUsers(): Promise<UserProfile[]> {
  const docPath = 'users';
  try {
    const q = query(
      collection(db, 'users'),
      where('status', '==', 'pending'),
      limit(20)
    );
    const snap = await getDocs(q);
    const users: UserProfile[] = [];
    snap.forEach((docSnap) => {
      const data = docSnap.data();
      users.push({
        uid: data.uid || docSnap.id,
        name: data.name || '',
        batch: data.batch || '',
        currentCity: data.currentCity || '',
        jobOrStudy: data.jobOrStudy || '',
        status: data.status || 'pending',
        updatedAt: data.updatedAt,
      });
    });
    return users;
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, docPath, auth);
    throw error;
  }
}

export async function updateUserStatus(userId: string, newStatus: 'approved' | 'rejected'): Promise<void> {
  const docPath = `users/${userId}`;
  try {
    const userDocRef = doc(db, 'users', userId);
    await updateDoc(userDocRef, {
      status: newStatus,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, docPath, auth);
    throw error;
  }
}

export interface DirectoryFetchResult {
  users: UserProfile[];
  lastDoc: QueryDocumentSnapshot<DocumentData> | null;
  hasMore: boolean;
}

export async function fetchApprovedAlumni(
  selectedBatch?: string,
  lastVisibleDoc?: QueryDocumentSnapshot<DocumentData> | null
): Promise<DirectoryFetchResult> {
  const docPath = 'users';
  try {
    const constraints: QueryConstraint[] = [
      where('status', '==', 'approved')
    ];

    if (selectedBatch && selectedBatch !== 'all') {
      constraints.push(where('batch', '==', selectedBatch));
    }

    if (lastVisibleDoc) {
      constraints.push(startAfter(lastVisibleDoc));
    }

    constraints.push(limit(PAGE_SIZE));

    const q = query(collection(db, 'users'), ...constraints);
    const snap = await getDocs(q);

    const users: UserProfile[] = [];
    snap.forEach((docSnap) => {
      const data = docSnap.data();
      users.push({
        uid: data.uid || docSnap.id,
        name: data.name || '',
        batch: data.batch || '',
        currentCity: data.currentCity || '',
        jobOrStudy: data.jobOrStudy || '',
        status: data.status || 'approved',
        updatedAt: data.updatedAt,
      });
    });

    const nextLastDoc = snap.docs.length > 0 ? snap.docs[snap.docs.length - 1] : null;
    const hasMore = snap.docs.length === PAGE_SIZE;

    return {
      users,
      lastDoc: nextLastDoc,
      hasMore,
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, docPath, auth);
    throw error;
  }
}

export type ContactVisibility = 'only_me' | 'approved';

export interface ContactDoc {
  value: string;
  visibility: ContactVisibility;
  updatedAt: string;
}

export async function fetchContactInfo(uid: string): Promise<{
  phone: ContactDoc | null;
  email: ContactDoc | null;
}> {
  const phoneRef = doc(db, 'users', uid, 'contact', 'phone');
  const emailRef = doc(db, 'users', uid, 'contact', 'email');

  let phone: ContactDoc | null = null;
  let email: ContactDoc | null = null;

  try {
    const phoneSnap = await getDoc(phoneRef);
    if (phoneSnap.exists()) {
      phone = phoneSnap.data() as ContactDoc;
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `users/${uid}/contact/phone`, auth);
  }

  try {
    const emailSnap = await getDoc(emailRef);
    if (emailSnap.exists()) {
      email = emailSnap.data() as ContactDoc;
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `users/${uid}/contact/email`, auth);
  }

  return { phone, email };
}

export async function saveContactInfo(
  uid: string,
  phoneVal: string,
  phoneVis: ContactVisibility,
  emailVal: string,
  emailVis: ContactVisibility
): Promise<void> {
  const phoneRef = doc(db, 'users', uid, 'contact', 'phone');
  const emailRef = doc(db, 'users', uid, 'contact', 'email');
  const isoNow = new Date().toISOString();

  if (phoneVal.trim()) {
    try {
      await setDoc(phoneRef, {
        value: phoneVal.trim(),
        visibility: phoneVis,
        updatedAt: isoNow,
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `users/${uid}/contact/phone`, auth);
      throw error;
    }
  } else {
    try {
      await deleteDoc(phoneRef);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `users/${uid}/contact/phone`, auth);
      throw error;
    }
  }

  if (emailVal.trim()) {
    try {
      await setDoc(emailRef, {
        value: emailVal.trim(),
        visibility: emailVis,
        updatedAt: isoNow,
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `users/${uid}/contact/email`, auth);
      throw error;
    }
  } else {
    try {
      await deleteDoc(emailRef);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `users/${uid}/contact/email`, auth);
      throw error;
    }
  }
}

export interface UserPhotoDoc {
  uid: string;
  base64: string;
  updatedAt: string;
}

export function resizeImageToBase64(file: File, maxDim = 200): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      return reject(new Error('Selected file must be an image.'));
    }

    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read image file.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Failed to decode image.'));
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          return reject(new Error('Canvas 2D context not available.'));
        }

        ctx.drawImage(img, 0, 0, width, height);
        const base64 = canvas.toDataURL('image/jpeg', 0.85);
        resolve(base64);
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

export async function saveUserPhoto(uid: string, base64: string): Promise<void> {
  const docRef = doc(db, 'photos', uid);
  const payload: UserPhotoDoc = {
    uid,
    base64,
    updatedAt: new Date().toISOString(),
  };
  try {
    await setDoc(docRef, payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `photos/${uid}`, auth);
    throw error;
  }
}

export async function fetchUserPhoto(uid: string): Promise<string | null> {
  try {
    const docRef = doc(db, 'photos', uid);
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      return (snap.data() as UserPhotoDoc)?.base64 || null;
    }
    return null;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `photos/${uid}`, auth);
    return null;
  }
}