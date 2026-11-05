import { useState, useEffect } from 'react';
import type { User } from 'firebase/auth';
import {
  subscribeToAuth,
  loginWithGoogle,
  logoutUser,
  fetchProfile,
  saveProfile,
  checkIsAdmin,
  fetchPendingUsers,
  updateUserStatus,
  type UserProfile,
  fetchContactInfo,
  saveContactInfo,
  type ContactVisibility,
  saveUserPhoto,
  fetchUserPhoto,
  resizeImageToBase64
} from './firebase';
import {
  GraduationCap,
  MapPin,
  Briefcase,
  Clock,
  CheckCircle2,
  LogOut,
  User as UserIcon,
  Edit3,
  School,
  AlertCircle,
  Save,
  ShieldAlert,
  Calendar,
  Shield,
  Check,
  X,
  RefreshCw,
  Users,
  XCircle,
  Phone,
  Mail,
  Lock,
  Camera
} from 'lucide-react';
import Directory from './Directory';

const PAGE_SIZE = 20;

export default function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [copiedDomain, setCopiedDomain] = useState(false);

  // View state: 'profile' | 'admin' | 'directory'
  const [currentView, setCurrentView] = useState<'profile' | 'admin' | 'directory'>('profile');

  // Admin state
  const [isAdmin, setIsAdmin] = useState(false);
  const [pendingUsers, setPendingUsers] = useState<UserProfile[]>([]);
  const [loadingPendingUsers, setLoadingPendingUsers] = useState(false);
  const [adminActionError, setAdminActionError] = useState('');
  const [adminActionSuccess, setAdminActionSuccess] = useState('');
  const [processingId, setProcessingId] = useState('');


  // Generate batch years from 2027 down to 1975 (newest first)
  const batchYears = Array.from({ length: 2027 - 1975 + 1 }, (_, i) => 2027 - i);

  // Private Contact Info state
  const [contactPhone, setContactPhone] = useState('');
  const [phoneVisibility, setPhoneVisibility] = useState<ContactVisibility>('only_me');
  const [contactEmail, setContactEmail] = useState('');
  const [emailVisibility, setEmailVisibility] = useState<ContactVisibility>('only_me');
  const [savingContact, setSavingContact] = useState(false);
  const [contactSavedMsg, setContactSavedMsg] = useState('');
  const [contactErrorMsg, setContactErrorMsg] = useState('');
  // Profile Photo state
  const [userPhoto, setUserPhoto] = useState<string | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [photoSuccessMsg, setPhotoSuccessMsg] = useState('');
  const [photoErrorMsg, setPhotoErrorMsg] = useState('');

  // Form states
  const [formData, setFormData] = useState<{
    name: string;
    batch: string;
    currentCity: string;
    jobOrStudy: string;
  }>({
    name: '',
    batch: '',
    currentCity: '',
    jobOrStudy: '',
  });

  // Subscribe to auth state
  useEffect(() => {
    const unsubscribe = subscribeToAuth(async (user) => {
      setCurrentUser(user);
      setLoadingAuth(false);
      if (user) {
        // 5. When profile page loads, read the two documents with getDoc using exact paths
        fetchContactInfo(user.uid)
          .then((contactData) => {
            if (contactData.phone) {
              setContactPhone(contactData.phone.value || '');
              setPhoneVisibility(contactData.phone.visibility || 'only_me');
            } else {
              setContactPhone('');
              setPhoneVisibility('only_me');
            }

            if (contactData.email) {
              setContactEmail(contactData.email.value || '');
              setEmailVisibility(contactData.email.visibility || 'only_me');
            } else {
              setContactEmail('');
              setEmailVisibility('only_me');
            }
          })
          .catch((err) => {
            console.error('Error fetching contact info:', err);
          });

        // Read user's photo from Firestore at photos/{uid}
        fetchUserPhoto(user.uid)
          .then((photoBase64) => {
            setUserPhoto(photoBase64);
          })
          .catch((err) => {
            console.error('Error fetching user photo:', err);
          });

        // 1. Check if a document exists at admins/{uid} in Firestore
        checkIsAdmin(user.uid)
          .then((hasAdminDoc) => {
            setIsAdmin(hasAdminDoc);
          })
          .catch((err) => {
            console.warn('Error checking admin status:', err);
            setIsAdmin(false);
          });

        setLoadingProfile(true);
        try {
          const userDoc = await fetchProfile(user.uid);
          if (userDoc) {
            setProfile(userDoc);
            setFormData({
              name: userDoc.name || '',
              batch: userDoc.batch || '',
              currentCity: userDoc.currentCity || '',
              jobOrStudy: userDoc.jobOrStudy || '',
            });
            setIsEditing(false);
          } else {
            // First time login - form name field starts empty or uses real Google display name
            setProfile(null);
            setFormData({
              name: user.displayName || '',
              batch: '',
              currentCity: '',
              jobOrStudy: '',
            });
            setIsEditing(true);
          }
        } catch (err: any) {
          console.error('Error fetching profile from Firestore:', err);
          setErrorMsg(err?.message || 'Failed to load profile from Firestore.');
        } finally {
          setLoadingProfile(false);
        }
      } else {
        setIsAdmin(false);
        setCurrentView('profile');
        setPendingUsers([]);
        setProfile(null);
        setFormData({
          name: '',
          batch: '',
          currentCity: '',
          jobOrStudy: '',
        });
        setContactPhone('');
        setPhoneVisibility('only_me');
        setContactEmail('');
        setEmailVisibility('only_me');
        setContactSavedMsg('');
        setContactErrorMsg('');
        setUserPhoto(null);
        setPhotoSuccessMsg('');
        setPhotoErrorMsg('');
      }
    });

    return () => unsubscribe();
  }, []);

  // Guard: unapproved or pending/rejected users cannot access directory view
  useEffect(() => {
    if (currentView === 'directory' && profile?.status !== 'approved') {
      setCurrentView('profile');
    }
  }, [currentView, profile?.status]);

  const loadPendingUsers = async () => {
    setLoadingPendingUsers(true);
    setAdminActionError('');
    try {
      const list = await fetchPendingUsers();
      setPendingUsers(list);
    } catch (err: any) {
      console.error('Fetch pending users error:', err);
      // 5. Show real error text on screen
      setAdminActionError(err?.message || String(err));
    } finally {
      setLoadingPendingUsers(false);
    }
  };

  const handleStatusUpdate = async (
    targetUserId: string,
    targetUserName: string,
    newStatus: 'approved' | 'rejected'
  ) => {
    setProcessingId(targetUserId);
    setAdminActionError('');
    setAdminActionSuccess('');
    try {
      await updateUserStatus(targetUserId, newStatus);
      // 4. After approving or rejecting, remove that person from the list and show a short success message.
      setPendingUsers((prev) => prev.filter((u) => u.uid !== targetUserId));
      setAdminActionSuccess(
        `${targetUserName || 'Applicant'} status has been updated to "${newStatus}".`
      );
      setTimeout(() => setAdminActionSuccess(''), 4000);
    } catch (err: any) {
      console.error(`Status update to ${newStatus} failed:`, err);
      // 5. If the Firestore call fails, show the real error text on screen.
      setAdminActionError(err?.message || String(err));
    } finally {
      setProcessingId('');
    }
  };

  const handleGoogleLogin = async () => {
    setErrorMsg('');
    try {
      await loginWithGoogle();
      // On success, onAuthStateChanged automatically sets currentUser and loads Firestore profile
    } catch (err: any) {
      console.error('Google Sign-In failed:', err);
      const code = err?.code || '';
      let msg = err?.message || 'Google Sign-In failed.';
      if (code === 'auth/unauthorized-domain') {
        const hostname = typeof window !== 'undefined' ? window.location.hostname : '';
        msg = `Firebase Error (auth/unauthorized-domain): This domain (${hostname}) has not been authorized in Firebase Console. Please add "${hostname}" in Firebase Console > Authentication > Settings > Authorized domains.`;
      } else if (code === 'auth/popup-blocked') {
        msg = 'Sign-in popup was blocked by your browser. Please allow popups for this site and try again.';
      } else if (code === 'auth/popup-closed-by-user') {
        msg = 'Sign-in popup was closed before completing.';
      }
      setErrorMsg(msg);
    }
  };

  const handleLogout = async () => {
    try {
      await logoutUser();
      setProfile(null);
      setIsEditing(false);
      setIsAdmin(false);
      setCurrentView('profile');
      setPendingUsers([]);
      setContactPhone('');
      setPhoneVisibility('only_me');
      setContactEmail('');
      setEmailVisibility('only_me');
      setContactSavedMsg('');
      setContactErrorMsg('');
      setUserPhoto(null);
      setPhotoSuccessMsg('');
      setPhotoErrorMsg('');
    } catch (err) {
      console.error('Logout error:', err);
    }
  };

  const handlePhotoFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !currentUser) return;

    setPhotoSuccessMsg('');
    setPhotoErrorMsg('');
    setUploadingPhoto(true);

    try {
      // 1. Resize image on device to max 200x200 pixels and convert to base64 string
      const base64 = await resizeImageToBase64(file, 200);

      // 2. Save to Firestore in collection "photos" with document ID = user.uid
      // Document fields: uid (string), base64 (string), and updatedAt (string)
      await saveUserPhoto(currentUser.uid, base64);

      setUserPhoto(base64);
      setPhotoSuccessMsg('Photo uploaded and saved successfully!');
      setTimeout(() => setPhotoSuccessMsg(''), 5000);
    } catch (err: any) {
      console.error('Photo upload error:', err);
      const code = err?.code;
      let rawMsg = err?.message || String(err);
      if (typeof rawMsg === 'string') {
        rawMsg = rawMsg.replace(/^FirebaseError:\s*/, '');
      }
      const formatted = code && !rawMsg.includes(code) ? `${code}: ${rawMsg}` : rawMsg;
      setPhotoErrorMsg(formatted);
    } finally {
      setUploadingPhoto(false);
      e.target.value = '';
    }
  };

  const handleSaveContactInfo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;

    setContactSavedMsg('');
    setContactErrorMsg('');

    const trimmedPhone = contactPhone.trim();
    const trimmedEmail = contactEmail.trim();

    // 4. Validate before saving
    if (trimmedPhone) {
      if (trimmedPhone.length < 5 || trimmedPhone.length > 20) {
        setContactErrorMsg('Phone number must be between 5 and 20 characters.');
        return;
      }
      const phoneRegex = /^[0-9+\s-]+$/;
      if (!phoneRegex.test(trimmedPhone)) {
        setContactErrorMsg('Phone number may contain only digits, +, spaces and -');
        return;
      }
    }

    if (trimmedEmail) {
      if (trimmedEmail.length > 100) {
        setContactErrorMsg('Email must be at most 100 characters.');
        return;
      }
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(trimmedEmail)) {
        setContactErrorMsg('Email must look like name@site.com and be at most 100 characters.');
        return;
      }
    }

    setSavingContact(true);
    try {
      await saveContactInfo(
        currentUser.uid,
        trimmedPhone,
        phoneVisibility,
        trimmedEmail,
        emailVisibility
      );
      setContactSavedMsg('Contact info saved successfully.');
      setTimeout(() => {
        setContactSavedMsg('');
      }, 5000);
    } catch (err: any) {
      console.error('Error saving contact info:', err);
      const code = err?.code;
      let rawMsg = err?.message || String(err);
      if (typeof rawMsg === 'string') {
        rawMsg = rawMsg.replace(/^FirebaseError:\s*/, '');
      }
      const formatted = code && !rawMsg.includes(code) ? `${code}: ${rawMsg}` : rawMsg;
      setContactErrorMsg(formatted);
    } finally {
      setSavingContact(false);
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;

    if (!formData.name.trim()) {
      setErrorMsg('Please enter your full name.');
      return;
    }
    if (!formData.batch) {
      setErrorMsg('Please select your batch.');
      return;
    }
    if (!formData.currentCity.trim()) {
      setErrorMsg('Please enter your current city.');
      return;
    }
    if (!formData.jobOrStudy.trim()) {
      setErrorMsg('Please enter your job or field of study.');
      return;
    }

    setSaving(true);
    setErrorMsg('');
    setSaveSuccessMsg('');

    try {
      const savedProfile = await saveProfile({
        uid: currentUser.uid,
        name: formData.name.trim(),
        batch: formData.batch,
        currentCity: formData.currentCity.trim(),
        jobOrStudy: formData.jobOrStudy.trim(),
        status: profile?.status,
      });

      setProfile(savedProfile);
      setIsEditing(false);
      setSaveSuccessMsg(
        savedProfile.status === 'pending'
          ? 'Profile saved successfully! Status is set to pending.'
          : 'Profile saved successfully!'
      );
      setTimeout(() => setSaveSuccessMsg(''), 5000);
    } catch (err: any) {
      console.error('Save profile error:', err);
      const code = err?.code;
      let rawMsg = err?.message || String(err);
      if (typeof rawMsg === 'string') {
        rawMsg = rawMsg.replace(/^FirebaseError:\s*/, '');
      }
      const displayMsg = code && !rawMsg.includes(code) ? `${code}: ${rawMsg}` : rawMsg;
      setErrorMsg(displayMsg || 'Failed to save profile.');
    } finally {
      setSaving(false);
    }
  };

  // Loading Screen
  if (loadingAuth) {
    return (
      <div className="min-h-screen bg-[#071c3d] flex flex-col items-center justify-center p-4">
        <div className="relative">
          <img
            src="/assets/aistudio/image_231b0ac8.png"
            alt="CGHS Logo"
            className="w-20 h-20 animate-pulse drop-shadow-lg"
          />
        </div>
        <p className="mt-4 text-blue-100 font-medium tracking-wide">Loading CGHS Alumni...</p>
      </div>
    );
  }

  // LOGIN PAGE
  if (!currentUser) {
    return (
      <div className="relative min-h-screen w-full flex items-center justify-center overflow-x-hidden p-4 sm:p-6">
        {/* Full-screen background: Three-storey school building under big trees */}
        <div
          className="fixed inset-0 bg-cover bg-center bg-no-repeat -z-20 scale-105 transform motion-safe:transition-transform duration-1000"
          style={{ backgroundImage: `url('/assets/aistudio/image_37ef4165.png')` }}
          aria-hidden="true"
        />

        {/* Dark blue gradient overlay for readability & contrast */}
        <div
          className="fixed inset-0 bg-gradient-to-b from-[#061838]/85 via-[#0b2859]/80 to-[#040f26]/95 -z-10 backdrop-blur-[2px]"
          aria-hidden="true"
        />

        {/* Top school bar indicator */}
        <div className="absolute top-4 left-4 right-4 flex items-center justify-between text-xs text-blue-200/80 max-w-4xl mx-auto pointer-events-none">
          <div className="flex items-center gap-1.5 font-medium">
            <School className="w-3.5 h-3.5 text-amber-400" />
            <span className="hidden sm:inline">Chandipasha Government High School</span>
            <span className="sm:hidden">CGHS, Nandail</span>
          </div>
          <span className="bg-blue-950/60 border border-blue-400/30 px-2 py-0.5 rounded-full text-amber-300 font-semibold tracking-wider">
            EST. 1915
          </span>
        </div>

        {/* Center Clean White Card */}
        <main className="w-full max-w-md bg-white rounded-3xl shadow-2xl border border-slate-100 p-6 sm:p-8 text-center relative z-10 my-8">
          {/* Subtle red & gold top accent bar reflecting the logo crest */}
          <div className="absolute top-0 left-8 right-8 h-1.5 bg-gradient-to-r from-red-600 via-amber-400 to-[#0c3672] rounded-b-full" />

          {/* School Logo: exact round crest with Bangla text */}
          <div className="flex justify-center pt-2 pb-4">
            <div className="relative group">
              <div className="absolute -inset-1.5 bg-gradient-to-r from-amber-400 to-blue-700 rounded-full blur opacity-30 group-hover:opacity-50 transition duration-300" />
              <img
                src="/assets/aistudio/image_231b0ac8.png"
                alt="Chandipasha Government High School Crest"
                className="relative w-28 h-28 sm:w-32 sm:h-32 object-contain drop-shadow-md mx-auto"
                loading="eager"
              />
            </div>
          </div>

          {/* Title */}
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-[#0c3672]">
            CGHS Alumni
          </h1>

          {/* Bangla crest affiliation */}
          <p className="text-sm font-semibold text-amber-700 mt-1">
            চন্ডী পাশা সরকারি উচ্চ বিদ্যালয়, নান্দাইল
          </p>

          {/* Required line */}
          <p className="text-xs sm:text-sm text-slate-600 mt-2 leading-relaxed px-2 font-medium">
            Chandipasha Government High School, Nandail, Mymensingh | Est. 1915
          </p>

          <div className="my-6 border-t border-slate-100" />

          {/* Sign In Message */}
          <div className="mb-6">
            <p className="text-sm text-slate-700 font-medium">
              Join the official directory of Chandipasha High School alumni
            </p>
            <p className="text-xs text-slate-500 mt-0.5">
              Connect with your batchmates and update your records
            </p>
          </div>

          {errorMsg && (
            <div className="mb-4 p-3.5 bg-red-50 border border-red-200 rounded-xl text-left text-xs text-red-700 space-y-2">
              <div className="flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 shrink-0 text-red-500 mt-0.5" />
                <span className="leading-relaxed break-words">{errorMsg}</span>
              </div>
              {errorMsg.includes('auth/unauthorized-domain') && (
                <div className="pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(window.location.hostname);
                      setCopiedDomain(true);
                      setTimeout(() => setCopiedDomain(false), 3000);
                    }}
                    className="w-full py-1.5 px-3 bg-red-100 hover:bg-red-200 text-red-900 rounded-lg font-semibold text-xs transition-colors cursor-pointer text-center"
                  >
                    {copiedDomain ? 'Copied domain to clipboard!' : `Copy Hostname: ${window.location.hostname}`}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* "Sign in with Google" button */}
          <button
            onClick={handleGoogleLogin}
            type="button"
            className="w-full flex items-center justify-center gap-3 bg-white hover:bg-slate-50 text-slate-700 font-semibold py-3.5 px-4 rounded-xl border border-slate-300 shadow-sm hover:shadow transition-all duration-200 active:scale-[0.99] focus:outline-none focus:ring-2 focus:ring-[#0c3672]/30"
          >
            {/* Authentic Google "G" SVG */}
            <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
              />
            </svg>
            <span className="text-slate-800 text-sm sm:text-base font-semibold">Sign in with Google</span>
          </button>

          {/* Privacy & secure note */}
          <div className="mt-6 flex items-center justify-center gap-1.5 text-[11px] text-slate-500">
            <ShieldAlert className="w-3.5 h-3.5 text-slate-400" />
            <span>Secure alumni portal • Read/write only own profile</span>
          </div>
        </main>
      </div>
    );
  }

  // LOGGED IN DASHBOARD
  return (
    <div className="min-h-screen bg-slate-100/80 flex flex-col font-sans">
      {/* 1. Header with small logo and app name */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-slate-200/80 shadow-xs">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          {/* Brand */}
          <div className="flex items-center gap-3">
            <img
              src="/assets/aistudio/image_231b0ac8.png"
              alt="CGHS Logo"
              className="w-10 h-10 object-contain drop-shadow-xs shrink-0"
            />
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-lg text-[#0c3672] tracking-tight">CGHS Alumni</span>
                <span className="bg-amber-100 text-amber-800 border border-amber-200 text-[10px] font-bold px-1.5 py-0.5 rounded-sm">
                  1915
                </span>
              </div>
              <p className="text-[11px] text-slate-500 font-medium hidden sm:block">
                Chandipasha Govt High School, Nandail
              </p>
            </div>
          </div>

          {/* User badge, Directory button, Admin button & Logout */}
          <div className="flex items-center gap-2 sm:gap-3">
            {profile?.status === 'approved' && (
              <button
                type="button"
                onClick={() => {
                  setErrorMsg('');
                  setAdminActionError('');
                  setCurrentView(currentView === 'directory' ? 'profile' : 'directory');
                }}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all shadow-xs cursor-pointer ${
                  currentView === 'directory'
                    ? 'bg-[#0c3672] text-white hover:bg-[#092857]'
                    : 'bg-emerald-100 hover:bg-emerald-200 text-emerald-900 border border-emerald-300'
                }`}
              >
                <Users className="w-3.5 h-3.5 text-emerald-700" />
                <span>{currentView === 'directory' ? 'My Profile' : 'Directory'}</span>
              </button>
            )}

            {isAdmin && (
              <button
                type="button"
                onClick={() => {
                  setErrorMsg('');
                  setAdminActionError('');
                  setAdminActionSuccess('');
                  if (currentView === 'admin') {
                    setCurrentView('profile');
                  } else {
                    setCurrentView('admin');
                    loadPendingUsers();
                  }
                }}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all shadow-xs cursor-pointer ${
                  currentView === 'admin'
                    ? 'bg-[#0c3672] text-white hover:bg-[#092857]'
                    : 'bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-300'
                }`}
              >
                <Shield className="w-3.5 h-3.5 text-amber-600" />
                <span>{currentView === 'admin' ? 'My Profile' : 'Admin Panel'}</span>
              </button>
            )}

            <div className="hidden xs:flex flex-col text-right">
              <span className="text-xs font-semibold text-slate-800 truncate max-w-[120px] sm:max-w-[180px]">
                {currentUser.displayName || currentUser.email || 'Member'}
              </span>
              <span className="text-[10px] text-slate-500 truncate max-w-[120px] sm:max-w-[180px]">
                {currentUser.email}
              </span>
            </div>

            {currentUser.photoURL ? (
              <img
                src={currentUser.photoURL}
                alt={currentUser.displayName || 'User'}
                className="w-9 h-9 rounded-full border-2 border-amber-400 object-cover"
              />
            ) : (
              <div className="w-9 h-9 rounded-full bg-[#0c3672] text-white flex items-center justify-center font-bold text-sm">
                {(currentUser.displayName || 'A').charAt(0).toUpperCase()}
              </div>
            )}

            <button
              onClick={handleLogout}
              title="Sign Out"
              className="p-2 text-slate-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors border border-transparent hover:border-red-100"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-4xl w-full mx-auto px-4 sm:px-6 py-5">
        {/* 2. Soft banner at the top of the page: Single-storey old building photo */}
        <div className="relative rounded-2xl overflow-hidden shadow-sm border border-slate-200 mb-6 bg-slate-900">
          <div className="aspect-[21/8] sm:aspect-[21/6] w-full overflow-hidden relative">
            <img
              src="/assets/aistudio/image_876f579a.png"
              alt="Chandipasha Govt High School Historic Building"
              className="w-full h-full object-cover scale-[1.08] transform hover:scale-[1.12] transition-transform duration-700"
              loading="lazy"
            />
            {/* Soft gradient overlay */}
            <div className="absolute inset-0 bg-gradient-to-t from-[#09224d]/85 via-[#0c3672]/30 to-transparent" />
            <div className="absolute inset-0 bg-gradient-to-r from-[#09224d]/60 via-transparent to-transparent" />
          </div>

          {/* Banner text & heritage badge */}
          <div className="absolute bottom-3 left-4 sm:left-6 right-4 sm:right-6 flex flex-col sm:flex-row sm:items-end justify-between gap-2 text-white">
            <div>
              <span className="inline-block bg-amber-400 text-[#0c3672] text-[10px] sm:text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded-md mb-1 shadow-xs">
                Heritage Building & Grounds
              </span>
              <h2 className="text-base sm:text-xl font-bold drop-shadow-md">
                Chandipasha Government High School
              </h2>
              <p className="text-xs text-blue-100 font-medium drop-shadow-xs">
                Nandail, Mymensingh • Established 1915
              </p>
            </div>
            <div className="hidden sm:block text-right">
              <span className="text-xs text-amber-200/90 font-medium">
                স্মৃতিবিজড়িত চন্ডী পাশা ক্যাম্পাস
              </span>
            </div>
          </div>
        </div>

        {/* Success / Error Alerts */}
        {saveSuccessMsg && (
          <div className="mb-5 p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl flex items-center gap-3 shadow-xs">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            <div className="text-sm font-medium">{saveSuccessMsg}</div>
          </div>
        )}

        {errorMsg && (
          <div className="mb-5 p-4 bg-red-50 border border-red-200 text-red-800 rounded-xl flex items-center gap-3 shadow-xs">
            <AlertCircle className="w-5 h-5 text-red-600 shrink-0" />
            <div className="text-sm font-medium break-words">{errorMsg}</div>
          </div>
        )}

        {/* Views: Directory, Admin Panel, or Alumni Profile */}
        {currentView === 'directory' && profile?.status === 'approved' ? (
          <Directory onBack={() => setCurrentView('profile')} />
        ) : currentView === 'admin' ? (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 sm:p-8">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-5 border-b border-slate-100 mb-6">
              <div>
                <div className="flex items-center gap-2">
                  <Shield className="w-5 h-5 text-amber-600" />
                  <h3 className="text-xl font-bold text-[#0c3672]">Admin Panel: Pending Applications</h3>
                  <span className="bg-amber-100 text-amber-800 text-xs font-bold px-2 py-0.5 rounded-full border border-amber-200">
                    {pendingUsers.length} Pending
                  </span>
                </div>
                <p className="text-xs sm:text-sm text-slate-500 mt-1">
                  Alumni profiles awaiting review (status == "pending", max 20)
                </p>
              </div>

              <div className="flex items-center gap-2 self-start sm:self-auto">
                <button
                  type="button"
                  onClick={loadPendingUsers}
                  disabled={loadingPendingUsers}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-50 cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loadingPendingUsers ? 'animate-spin' : ''}`} />
                  <span>Refresh</span>
                </button>
                <button
                  type="button"
                  onClick={() => setCurrentView('profile')}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium transition-colors cursor-pointer"
                >
                  <span>Close Admin</span>
                </button>
              </div>
            </div>

            {/* Short Success Message */}
            {adminActionSuccess && (
              <div className="mb-5 p-3.5 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl flex items-center gap-2.5 text-xs font-medium shadow-xs">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>{adminActionSuccess}</span>
              </div>
            )}

            {/* Real Error Message */}
            {adminActionError && (
              <div className="mb-5 p-3.5 bg-red-50 border border-red-200 text-red-800 rounded-xl flex items-start gap-2.5 text-xs font-medium shadow-xs">
                <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                <span className="leading-relaxed break-words">{adminActionError}</span>
              </div>
            )}

            {/* Loading / Empty / List */}
            {loadingPendingUsers ? (
              <div className="py-12 text-center">
                <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-[#0c3672] border-t-transparent" />
                <p className="mt-3 text-xs text-slate-500 font-medium">Fetching pending applications from Firestore...</p>
              </div>
            ) : pendingUsers.length === 0 ? (
              <div className="py-12 text-center border-2 border-dashed border-slate-200 rounded-xl">
                <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto opacity-70" />
                <p className="mt-3 text-sm font-semibold text-slate-800">No Pending Applications</p>
                <p className="text-xs text-slate-500 mt-1">
                  There are currently no alumni profiles with status "pending".
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {pendingUsers.map((u) => {
                  const isProcessing = processingId === u.uid;
                  return (
                    <div
                      key={u.uid}
                      className="p-4 sm:p-5 rounded-2xl border border-slate-200 bg-slate-50/70 hover:bg-slate-50 transition-colors flex flex-col md:flex-row md:items-center justify-between gap-4"
                    >
                      <div className="space-y-1.5 flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h4 className="text-base font-bold text-slate-900 truncate">{u.name}</h4>
                          <span className="inline-flex items-center gap-1 bg-blue-100 text-[#0c3672] border border-blue-200 text-xs font-bold px-2.5 py-0.5 rounded-full">
                            <GraduationCap className="w-3 h-3" />
                            Batch {u.batch}
                          </span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-xs text-slate-600">
                          <div className="flex items-center gap-1.5">
                            <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <span className="font-semibold text-slate-500">Current City:</span>
                            <span className="text-slate-800 font-medium">{u.currentCity}</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <Briefcase className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <span className="font-semibold text-slate-500">Job or Study:</span>
                            <span className="text-slate-800 font-medium truncate">{u.jobOrStudy}</span>
                          </div>
                        </div>
                      </div>

                      {/* Action buttons: Approve and Reject */}
                      <div className="flex items-center gap-2 pt-2 md:pt-0 border-t md:border-t-0 border-slate-200">
                        <button
                          type="button"
                          disabled={isProcessing}
                          onClick={() => handleStatusUpdate(u.uid, u.name, 'approved')}
                          className="flex-1 md:flex-initial inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-xs hover:shadow transition-all active:scale-[0.98] disabled:opacity-50 cursor-pointer"
                        >
                          <Check className="w-3.5 h-3.5" />
                          <span>{isProcessing ? 'Updating...' : 'Approve'}</span>
                        </button>

                        <button
                          type="button"
                          disabled={isProcessing}
                          onClick={() => handleStatusUpdate(u.uid, u.name, 'rejected')}
                          className="flex-1 md:flex-initial inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-semibold shadow-xs hover:shadow transition-all active:scale-[0.98] disabled:opacity-50 cursor-pointer"
                        >
                          <X className="w-3.5 h-3.5" />
                          <span>{isProcessing ? 'Updating...' : 'Reject'}</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : loadingProfile ? (
          <div className="bg-white rounded-2xl p-8 border border-slate-200 text-center shadow-xs">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-[#0c3672] border-t-transparent" />
            <p className="mt-3 text-sm text-slate-500 font-medium">Loading your alumni record...</p>
          </div>
        ) : (
          <div className="space-y-6">
            {profile && !isEditing ? (
              /* 3. SHOW SAVED PROFILE VIEW */
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 overflow-hidden relative">
              {/* Colored top accent stripe */}
              <div
                className={`absolute top-0 left-0 right-0 h-1 ${
                  profile.status === 'approved'
                    ? 'bg-emerald-500'
                    : profile.status === 'rejected'
                    ? 'bg-red-500'
                    : 'bg-amber-400'
                }`}
              />

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-slate-100">
                <div className="flex items-center gap-3.5">
                  {userPhoto ? (
                    <img
                      src={userPhoto}
                      alt={profile.name}
                      className="w-13 h-13 rounded-2xl object-cover border-2 border-white shadow-sm ring-1 ring-slate-200 shrink-0"
                    />
                  ) : (
                    <div className="w-13 h-13 rounded-2xl bg-gradient-to-br from-[#0c3672] to-blue-700 text-white font-bold text-xl flex items-center justify-center shadow-xs shrink-0">
                      {(profile.name || 'A').charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div>
                    <h3 className="text-xl font-bold text-slate-900">{profile.name}</h3>
                    <p className="text-xs text-slate-500">
                      Alumni ID: <span className="font-mono text-slate-700">{profile.uid.substring(0, 12)}...</span>
                    </p>
                  </div>
                </div>

                {/* Status Badge */}
                <div className="flex items-center gap-2">
                  <div
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold ${
                      profile.status === 'approved'
                        ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                        : profile.status === 'rejected'
                        ? 'bg-red-50 text-red-800 border border-red-200'
                        : 'bg-amber-50 text-amber-800 border border-amber-200'
                    }`}
                  >
                    {profile.status === 'approved' ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    ) : profile.status === 'rejected' ? (
                      <XCircle className="w-3.5 h-3.5 text-red-600" />
                    ) : (
                      <Clock className="w-3.5 h-3.5 text-amber-600 animate-pulse" />
                    )}
                    <span>
                      Status:{' '}
                      {profile.status === 'approved'
                        ? 'Approved'
                        : profile.status === 'rejected'
                        ? 'Rejected'
                        : 'Pending Review'}
                    </span>
                  </div>
                  <button
                    onClick={() => {
                      setFormData({
                        name: profile.name,
                        batch: profile.batch,
                        currentCity: profile.currentCity,
                        jobOrStudy: profile.jobOrStudy,
                      });
                      setIsEditing(true);
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors"
                  >
                    <Edit3 className="w-3.5 h-3.5 text-slate-500" />
                    <span>Edit</span>
                  </button>
                </div>
              </div>

              {/* Status Explanation Banner */}
              {profile.status === 'pending' ? (
                <div className="mt-4 p-3.5 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-3">
                  <Clock className="w-4 h-4 text-amber-600 shrink-0 mt-0.5 animate-pulse" />
                  <div className="text-xs text-amber-900 leading-relaxed">
                    <p className="font-bold text-amber-950 mb-0.5">
                      Your profile is waiting for approval
                    </p>
                    <p>
                      Your profile has been submitted and is currently waiting for admin approval. Once approved, the Directory page will become accessible.
                    </p>
                  </div>
                </div>
              ) : profile.status === 'rejected' ? (
                <div className="mt-4 p-3.5 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3">
                  <XCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                  <div className="text-xs text-red-900 leading-relaxed">
                    <p className="font-bold text-red-950 mb-0.5">
                      Your request was rejected
                    </p>
                    <p>
                      Your alumni verification request was rejected. You can edit your information or contact the school alumni administration for more information.
                    </p>
                  </div>
                </div>
              ) : profile.status === 'approved' ? (
                <div className="mt-4 flex items-center gap-2 text-xs font-semibold text-emerald-700">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>Approved alumni</span>
                </div>
              ) : null}

              {/* Profile Details Grid */}
              <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-100 flex items-start gap-3.5">
                  <div className="p-2.5 rounded-lg bg-blue-100/70 text-[#0c3672]">
                    <GraduationCap className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold block">
                      SSC Batch
                    </span>
                    <span className="text-base font-bold text-slate-800">
                      Batch {profile.batch}
                    </span>
                    <span className="text-xs text-slate-500 block">Chandipasha Govt High School</span>
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-slate-50 border border-slate-100 flex items-start gap-3.5">
                  <div className="p-2.5 rounded-lg bg-emerald-100/70 text-emerald-700">
                    <MapPin className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold block">
                      Current City
                    </span>
                    <span className="text-base font-bold text-slate-800">
                      {profile.currentCity}
                    </span>
                    <span className="text-xs text-slate-500 block">Current residence location</span>
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-slate-50 border border-slate-100 flex items-start gap-3.5 sm:col-span-2">
                  <div className="p-2.5 rounded-lg bg-purple-100/70 text-purple-700">
                    <Briefcase className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold block">
                      Job or Study
                    </span>
                    <span className="text-base font-bold text-slate-800">
                      {profile.jobOrStudy}
                    </span>
                    <span className="text-xs text-slate-500 block">Profession / Academic pursuit</span>
                  </div>
                </div>
              </div>

              {/* Timestamp footer */}
              {profile.updatedAt && (
                <div className="mt-5 pt-4 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    Last updated: {new Date(profile.updatedAt).toLocaleString()}
                  </span>
                  <span className="text-emerald-600 font-medium flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" />
                    Secure ABAC Protected
                  </span>
                </div>
              )}
            </div>
          ) : (
            /* 4. PROFILE FORM (First time or Editing) */
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 sm:p-8">
            <div className="flex items-center justify-between pb-5 border-b border-slate-100 mb-6">
              <div>
                <h3 className="text-xl font-bold text-[#0c3672]">
                  {profile ? 'Edit Alumni Profile' : 'Complete Your Alumni Profile'}
                </h3>
                <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
                  Please provide your details for the Chandipasha High School directory
                </p>
              </div>

              {profile && (
                <button
                  type="button"
                  onClick={() => setIsEditing(false)}
                  className="text-xs text-slate-500 hover:text-slate-800 px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
              )}
            </div>

            {profile && profile.status === 'pending' && (
              <div className="mb-5 p-3.5 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-3">
                <Clock className="w-4 h-4 text-amber-600 shrink-0 mt-0.5 animate-pulse" />
                <div className="text-xs text-amber-900 leading-relaxed">
                  <p className="font-bold text-amber-950 mb-0.5">
                    Your profile is waiting for approval
                  </p>
                  <p>
                    You can make updates to your profile while it is under review.
                  </p>
                </div>
              </div>
            )}

            {profile && profile.status === 'rejected' && (
              <div className="mb-5 p-3.5 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3">
                <XCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                <div className="text-xs text-red-900 leading-relaxed">
                  <p className="font-bold text-red-950 mb-0.5">
                    Your request was rejected
                  </p>
                  <p>
                    Your previous request was rejected. You may edit and update your information below.
                  </p>
                </div>
              </div>
            )}

            <form onSubmit={handleSaveProfile} className="space-y-5">
              {/* Field 1: Name */}
              <div>
                <label htmlFor="name" className="block text-sm font-semibold text-slate-800 mb-1.5">
                  Full Name <span className="text-red-600">*</span>
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                    <UserIcon className="w-4 h-4" />
                  </div>
                  <input
                    type="text"
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="Enter your name as per school records"
                    className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-[#0c3672] focus:border-transparent text-sm text-slate-800 transition-shadow"
                    required
                  />
                </div>
              </div>

              {/* Field 2: Batch (dropdown: 2027 down to 1975) */}
              <div>
                <label htmlFor="batch" className="block text-sm font-semibold text-slate-800 mb-1.5">
                  Batch (SSC year) <span className="text-red-600">*</span>
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                    <GraduationCap className="w-4 h-4" />
                  </div>
                  <select
                    id="batch"
                    value={formData.batch}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        batch: e.target.value,
                      })
                    }
                    className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-[#0c3672] focus:border-transparent text-sm text-slate-800 bg-white transition-shadow appearance-none cursor-pointer"
                    required
                  >
                    <option value="" disabled>
                      Select your SSC year
                    </option>
                    {batchYears.map((year) => (
                      <option key={year} value={year.toString()}>
                        {year}
                      </option>
                    ))}
                  </select>
                  <div className="absolute inset-y-0 right-0 pr-3.5 flex items-center pointer-events-none text-slate-400">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </div>
              </div>

              {/* Field 3: Current City */}
              <div>
                <label htmlFor="currentCity" className="block text-sm font-semibold text-slate-800 mb-1.5">
                  Current City <span className="text-red-600">*</span>
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                    <MapPin className="w-4 h-4" />
                  </div>
                  <input
                    type="text"
                    id="currentCity"
                    value={formData.currentCity}
                    onChange={(e) => setFormData({ ...formData, currentCity: e.target.value })}
                    placeholder="e.g. Dhaka, Mymensingh, Chittagong, etc."
                    className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-[#0c3672] focus:border-transparent text-sm text-slate-800 transition-shadow"
                    required
                  />
                </div>
              </div>

              {/* Field 4: Job or Study */}
              <div>
                <label htmlFor="jobOrStudy" className="block text-sm font-semibold text-slate-800 mb-1.5">
                  Job or Study <span className="text-red-600">*</span>
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                    <Briefcase className="w-4 h-4" />
                  </div>
                  <input
                    type="text"
                    id="jobOrStudy"
                    value={formData.jobOrStudy}
                    onChange={(e) => setFormData({ ...formData, jobOrStudy: e.target.value })}
                    placeholder="e.g. Software Engineer at XYZ / BSc in CSE at BUET"
                    className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-[#0c3672] focus:border-transparent text-sm text-slate-800 transition-shadow"
                    required
                  />
                </div>
              </div>

              {/* Firestore Document Path notice */}
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-600 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />
                <span>
                  Profile will be stored at{' '}
                  <code className="text-[#0c3672] font-semibold font-mono">users/{currentUser.uid}</code> with{' '}
                  <span className="font-semibold text-amber-700">status = "pending"</span>.
                </span>
              </div>

              {/* Submit Button */}
              <div className="pt-2 flex items-center gap-3">
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 flex items-center justify-center gap-2 bg-[#0c3672] hover:bg-[#092857] text-white font-semibold py-3.5 px-6 rounded-xl shadow-md hover:shadow-lg transition-all active:scale-[0.99] disabled:opacity-60 cursor-pointer"
                >
                  {saving ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>Saving Profile...</span>
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4" />
                      <span>Save Profile</span>
                    </>
                  )}
                </button>

                {profile && (
                  <button
                    type="button"
                    onClick={() => setIsEditing(false)}
                    className="px-5 py-3.5 rounded-xl border border-slate-300 text-slate-700 font-semibold hover:bg-slate-50 transition-colors"
                  >
                    Cancel
                  </button>
                )}
              </div>
            </form>
          </div>
        )}

        {/* Profile Photo Section */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 sm:p-8">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-5 border-b border-slate-100 mb-6">
            <div>
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-blue-50 text-[#0c3672] border border-blue-200">
                  <Camera className="w-4 h-4" />
                </div>
                <h3 className="text-xl font-bold text-[#0c3672]">Alumni Photo</h3>
              </div>
              <p className="text-xs sm:text-sm text-slate-500 mt-1">
                Your photo will be shown in the Directory. Images are resized to a maximum of 200x200 pixels.
              </p>
            </div>
          </div>

          {photoSuccessMsg && (
            <div className="mb-5 p-3.5 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl flex items-center gap-2.5 text-xs font-semibold shadow-xs">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{photoSuccessMsg}</span>
            </div>
          )}

          {photoErrorMsg && (
            <div className="mb-5 p-3.5 bg-red-50 border border-red-200 text-red-800 rounded-xl flex items-center gap-2.5 text-xs font-medium shadow-xs">
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
              <span className="break-words">{photoErrorMsg}</span>
            </div>
          )}

          <div className="flex flex-col sm:flex-row sm:items-center gap-6">
            <div className="shrink-0 flex flex-col items-center gap-2">
              {userPhoto ? (
                <img
                  src={userPhoto}
                  alt="Alumni photo preview"
                  className="w-24 h-24 rounded-2xl object-cover border-2 border-white shadow-md ring-1 ring-slate-200"
                />
              ) : (
                <div className="w-24 h-24 rounded-2xl bg-gradient-to-br from-[#0c3672] to-blue-700 text-white font-bold text-3xl flex items-center justify-center shadow-md">
                  {(profile?.name || currentUser.displayName || 'A').charAt(0).toUpperCase()}
                </div>
              )}
              <span className="text-[11px] text-slate-500 font-medium">
                {userPhoto ? 'Current Photo' : 'No Photo Uploaded'}
              </span>
            </div>

            <div className="space-y-3 flex-1 max-w-md">
              <div>
                <label htmlFor="upload-photo-input" className="block text-sm font-semibold text-slate-800 mb-1.5">
                  Upload Photo
                </label>
                <input
                  id="upload-photo-input"
                  type="file"
                  accept="image/*"
                  onChange={handlePhotoFileChange}
                  disabled={uploadingPhoto}
                  className="block w-full text-xs text-slate-600 file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-[#0c3672] file:text-white hover:file:bg-[#092857] file:cursor-pointer cursor-pointer border border-slate-300 rounded-xl p-1.5 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-[#0c3672]"
                />
              </div>

              <p className="text-[11px] text-slate-500 leading-relaxed">
                When you select an image, it is resized on your device to 200x200 max, converted to base64, and saved to the photos collection.
              </p>

              {uploadingPhoto && (
                <div className="flex items-center gap-2 text-xs text-[#0c3672] font-semibold">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Resizing and saving photo to Firestore...</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Private Contact Info Section */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 sm:p-8">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-5 border-b border-slate-100 mb-6">
            <div>
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-amber-50 text-amber-700 border border-amber-200">
                  <Lock className="w-4 h-4" />
                </div>
                <h3 className="text-xl font-bold text-[#0c3672]">Private Contact Info</h3>
                <span className="bg-slate-100 text-slate-700 text-[11px] font-semibold px-2 py-0.5 rounded-full border border-slate-200 flex items-center gap-1">
                  <Shield className="w-3 h-3 text-slate-500" />
                  Confidential
                </span>
              </div>
              <p className="text-xs sm:text-sm text-slate-500 mt-1">
                Only you can see this unless you choose Approved alumni.
              </p>
            </div>
          </div>

          {contactSavedMsg && (
            <div className="mb-5 p-3.5 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl flex items-center gap-2.5 text-xs font-semibold shadow-xs">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{contactSavedMsg}</span>
            </div>
          )}

          {contactErrorMsg && (
            <div className="mb-5 p-3.5 bg-red-50 border border-red-200 text-red-800 rounded-xl flex items-center gap-2.5 text-xs font-medium shadow-xs">
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
              <span className="break-words">{contactErrorMsg}</span>
            </div>
          )}

          <form onSubmit={handleSaveContactInfo} className="space-y-4 max-w-xl">
            {/* Field: Phone */}
            <div>
              <div className="flex flex-col sm:flex-row sm:items-end gap-3">
                <div className="flex-1">
                  <label htmlFor="contact-phone" className="block text-sm font-semibold text-slate-800 mb-1.5">
                    Phone
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                      <Phone className="w-4 h-4" />
                    </div>
                    <input
                      type="tel"
                      id="contact-phone"
                      value={contactPhone}
                      onChange={(e) => {
                        setContactPhone(e.target.value);
                        setContactErrorMsg('');
                      }}
                      placeholder="+880 1XXX-XXXXXX"
                      className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-[#0c3672] focus:border-transparent text-sm text-slate-800 transition-shadow"
                    />
                  </div>
                </div>

                <div className="sm:w-48">
                  <label htmlFor="contact-phone-visibility" className="block text-xs font-semibold text-slate-600 mb-1.5">
                    Who can see this?
                  </label>
                  <select
                    id="contact-phone-visibility"
                    value={phoneVisibility}
                    onChange={(e) => setPhoneVisibility(e.target.value as ContactVisibility)}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-[#0c3672] text-xs font-medium text-slate-700 bg-white cursor-pointer"
                  >
                    <option value="only_me">Only me</option>
                    <option value="approved">Approved alumni</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Field: Email */}
            <div>
              <div className="flex flex-col sm:flex-row sm:items-end gap-3">
                <div className="flex-1">
                  <label htmlFor="contact-email" className="block text-sm font-semibold text-slate-800 mb-1.5">
                    Email
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                      <Mail className="w-4 h-4" />
                    </div>
                    <input
                      type="email"
                      id="contact-email"
                      value={contactEmail}
                      onChange={(e) => {
                        setContactEmail(e.target.value);
                        setContactErrorMsg('');
                      }}
                      placeholder="name@site.com"
                      className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-[#0c3672] focus:border-transparent text-sm text-slate-800 transition-shadow"
                    />
                  </div>
                </div>

                <div className="sm:w-48">
                  <label htmlFor="contact-email-visibility" className="block text-xs font-semibold text-slate-600 mb-1.5">
                    Who can see this?
                  </label>
                  <select
                    id="contact-email-visibility"
                    value={emailVisibility}
                    onChange={(e) => setEmailVisibility(e.target.value as ContactVisibility)}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-[#0c3672] text-xs font-medium text-slate-700 bg-white cursor-pointer"
                  >
                    <option value="only_me">Only me</option>
                    <option value="approved">Approved alumni</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={savingContact}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#0c3672] hover:bg-[#092857] text-white text-sm font-semibold shadow-xs hover:shadow transition-all active:scale-[0.98] disabled:opacity-60 cursor-pointer"
              >
                {savingContact ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <Save className="w-4 h-4" />
                )}
                <span>{savingContact ? 'Saving...' : 'Save Contact Info'}</span>
              </button>
            </div>
          </form>
        </div>
      </div>
    )}

        {/* Security and Information Card */}
        <div className="mt-8 p-4 sm:p-5 bg-white rounded-2xl border border-slate-200/90 text-xs text-slate-600 shadow-xs">
          <div className="flex items-center justify-between mb-2 pb-2 border-b border-slate-100">
            <span className="font-semibold text-slate-800 flex items-center gap-1.5">
              <School className="w-3.5 h-3.5 text-[#0c3672]" />
              Chandipasha Government High School Alumni Portal
            </span>
            <span className="text-amber-700 font-semibold">Est. 1915</span>
          </div>
          <p className="leading-relaxed">
            Security policy enforced: A logged-in alumnus can read and write only their own record at{' '}
            <code className="font-mono text-slate-800 bg-slate-100 px-1 py-0.5 rounded">users/{currentUser.uid}</code>.
            All member entries are reviewed before publication in the public directory.
          </p>
        </div>
      </main>
    </div>
  );
}
