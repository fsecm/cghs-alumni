const PAGE_SIZE = 20;

import { useState, useEffect } from 'react';
import {
  collection,
  doc,
  getDoc,
  query,
  where,
  limit,
  startAfter,
  getDocs,
  type QueryDocumentSnapshot,
  type DocumentData,
  type QueryConstraint
} from 'firebase/firestore';
import { db, type UserProfile } from './firebase';
import {
  Users,
  RefreshCw,
  AlertCircle,
  MapPin,
  Briefcase,
  Search,
  X
} from 'lucide-react';

interface DirectoryProps {
  onBack: () => void;
}

export default function Directory({ onBack }: DirectoryProps) {
  const [selectedBatch, setSelectedBatch] = useState('all');
  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [userPhotos, setUserPhotos] = useState<Record<string, string>>({});
  const [lastDoc, setLastDoc] = useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Deterministic avatar circle colors for alumni without uploaded photo
  const avatarColors = [
    'bg-[#0c3672]',
    'bg-emerald-600',
    'bg-amber-600',
    'bg-indigo-600',
    'bg-rose-600',
    'bg-teal-600',
    'bg-purple-600',
    'bg-cyan-600',
  ];

  const getAvatarColor = (name: string) => {
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    const idx = Math.abs(hash) % avatarColors.length;
    return avatarColors[idx];
  };

  // Batch years from 2027 down to 1975 (newest first)
  const batchYears = Array.from({ length: 2027 - 1975 + 1 }, (_, i) => 2027 - i);

  // Debounce search input by 500ms, only if at least 2 characters typed. If empty, show normal list.
  useEffect(() => {
    const handler = setTimeout(() => {
      const trimmed = searchInput.trim();
      if (trimmed.length >= 2) {
        setDebouncedSearch(trimmed.toLowerCase());
      } else {
        setDebouncedSearch('');
      }
    }, 500);

    return () => {
      clearTimeout(handler);
    };
  }, [searchInput]);

  const fetchAlumni = async (
    batch: string,
    search: string,
    cursor: QueryDocumentSnapshot<DocumentData> | null,
    isInitial: boolean
  ) => {
    if (isInitial) {
      setLoading(true);
      setErrorMsg('');
      setUsers([]);
    } else {
      setLoadingMore(true);
    }

    try {
      const constraints: QueryConstraint[] = [
        where('status', '==', 'approved')
      ];

      if (batch && batch !== 'all') {
        constraints.push(where('batch', '==', batch));
      }

      if (search) {
        constraints.push(where('nameLower', '>=', search));
        constraints.push(where('nameLower', '<=', search + '\uf8ff'));
      }

      if (cursor) {
        constraints.push(startAfter(cursor));
      }

      // Use PAGE_SIZE for limit()
      constraints.push(limit(PAGE_SIZE));

      const q = query(collection(db, 'users'), ...constraints);
      const snap = await getDocs(q);

      const fetchedUsers: UserProfile[] = [];
      snap.forEach((docSnap) => {
        const data = docSnap.data();
        fetchedUsers.push({
          uid: data.uid || docSnap.id,
          name: data.name || '',
          batch: data.batch || '',
          currentCity: data.currentCity || '',
          jobOrStudy: data.jobOrStudy || '',
          status: data.status || 'approved',
          updatedAt: data.updatedAt,
        });
      });

      if (isInitial) {
        setUsers(fetchedUsers);
      } else {
        setUsers((prev) => [...prev, ...fetchedUsers]);
      }

      // Fetch photos from photos/{uid} for each alumni in fetchedUsers
      if (fetchedUsers.length > 0) {
        const photoMap: Record<string, string> = {};
        await Promise.all(
          fetchedUsers.map(async (u) => {
            try {
              const photoSnap = await getDoc(doc(db, 'photos', u.uid));
              if (photoSnap.exists()) {
                const b64 = photoSnap.data()?.base64;
                if (b64) photoMap[u.uid] = b64;
              }
            } catch {
              // Ignore if no photo exists
            }
          })
        );

        if (isInitial) {
          setUserPhotos(photoMap);
        } else {
          setUserPhotos((prev) => ({ ...prev, ...photoMap }));
        }
      } else if (isInitial) {
        setUserPhotos({});
      }

      const nextLastDoc = snap.docs.length > 0 ? snap.docs[snap.docs.length - 1] : null;
      setLastDoc(nextLastDoc);

      // Use PAGE_SIZE for deciding when to show "Load more"
      setHasMore(snap.docs.length === PAGE_SIZE);
    } catch (err: any) {
      console.error('Directory query failed:', err);
      // Show real Firestore error text on screen
      setErrorMsg(err?.message || String(err));
    } finally {
      if (isInitial) {
        setLoading(false);
      } else {
        setLoadingMore(false);
      }
    }
  };

  useEffect(() => {
    fetchAlumni(selectedBatch, debouncedSearch, null, true);
  }, [selectedBatch, debouncedSearch]);

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 sm:p-8">
      {/* Header bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-slate-100 mb-6">
        <div>
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-emerald-600" />
            <h3 className="text-xl font-bold text-[#0c3672]">Alumni Directory</h3>
            <span className="bg-emerald-100 text-emerald-800 text-xs font-bold px-2.5 py-0.5 rounded-full border border-emerald-200">
              Approved Alumni
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Directory of verified graduates from Chandipasha Government High School
          </p>
        </div>

        {/* Batch dropdown filter (All batches + 2027 down to 1975) */}
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <label htmlFor="directory-batch-filter" className="text-xs font-semibold text-slate-700 whitespace-nowrap">
            Batch:
          </label>
          <select
            id="directory-batch-filter"
            value={selectedBatch}
            onChange={(e) => setSelectedBatch(e.target.value)}
            className="px-3 py-1.5 rounded-xl border border-slate-300 text-xs font-semibold text-slate-800 bg-white shadow-xs focus:outline-none focus:ring-2 focus:ring-[#0c3672] cursor-pointer"
          >
            <option value="all">All batches</option>
            {batchYears.map((year) => (
              <option key={year} value={year.toString()}>
                Batch {year}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => fetchAlumni(selectedBatch, debouncedSearch, null, true)}
            disabled={loading}
            title="Refresh Directory"
            className="p-1.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-600 transition-colors disabled:opacity-50 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            type="button"
            onClick={onBack}
            className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>

      {/* Search by name text box above the cards */}
      <div className="mb-6">
        <div className="relative max-w-md">
          <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
            <Search className="w-4 h-4" />
          </div>
          <input
            type="text"
            id="directory-search-name"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search by name"
            className="w-full pl-10 pr-9 py-2 rounded-xl border border-slate-300 text-xs sm:text-sm text-slate-800 bg-white placeholder-slate-400 shadow-xs focus:outline-none focus:ring-2 focus:ring-[#0c3672] transition-all"
          />
          {searchInput && (
            <button
              type="button"
              onClick={() => {
                setSearchInput('');
                setDebouncedSearch('');
              }}
              className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 cursor-pointer"
              title="Clear search"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        {searchInput.trim().length === 1 && (
          <p className="text-[11px] text-slate-500 mt-1.5 ml-1">
            Type at least 2 characters to search
          </p>
        )}
      </div>

      {/* Real Firestore Error on Screen */}
      {errorMsg && (
        <div className="mb-5 p-3.5 bg-red-50 border border-red-200 text-red-800 rounded-xl flex items-start gap-2.5 text-xs font-medium shadow-xs">
          <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
          <span className="leading-relaxed break-words">{errorMsg}</span>
        </div>
      )}

      {/* Loading state */}
      {loading ? (
        <div className="py-12 text-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-[#0c3672] border-t-transparent" />
          <p className="mt-3 text-xs text-slate-500 font-medium">Loading approved alumni...</p>
        </div>
      ) : users.length === 0 ? (
        <div className="py-12 text-center border-2 border-dashed border-slate-200 rounded-xl">
          <Users className="w-10 h-10 text-slate-400 mx-auto opacity-70" />
          <p className="mt-3 text-sm font-semibold text-slate-800">No alumni found</p>
          <p className="text-xs text-slate-500 mt-1">
            {debouncedSearch
              ? `No approved alumni found matching "${searchInput.trim()}".`
              : selectedBatch === 'all'
              ? 'No approved alumni found in the directory yet.'
              : `No approved alumni found for Batch ${selectedBatch}.`}
          </p>
        </div>
      ) : (
        /* Cards: Name, Batch, Current City, Job/Study only. No email, photo, or uid. */
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {users.map((u, idx) => (
              <div
                key={u.uid || `user-${idx}`}
                className="p-4 sm:p-5 rounded-2xl border border-slate-200 bg-slate-50/60 hover:bg-slate-50 hover:border-[#0c3672]/30 transition-all flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center gap-3 pb-2.5 border-b border-slate-200/80">
                    {userPhotos[u.uid] ? (
                      <img
                        src={userPhotos[u.uid]}
                        alt={u.name}
                        className="w-10 h-10 rounded-full object-cover border-2 border-white shadow-xs shrink-0"
                      />
                    ) : (
                      <div
                        className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm shadow-xs shrink-0 ${getAvatarColor(
                          u.name
                        )}`}
                      >
                        {u.name ? u.name.trim().charAt(0).toUpperCase() : 'A'}
                      </div>
                    )}

                    <div className="min-w-0 flex-1 flex items-center justify-between gap-2">
                      <h4 className="text-base font-bold text-slate-900 truncate">{u.name}</h4>
                      <span className="shrink-0 bg-blue-100 text-[#0c3672] border border-blue-200 text-xs font-bold px-2.5 py-0.5 rounded-full">
                        Batch {u.batch}
                      </span>
                    </div>
                  </div>

                  <div className="mt-3 space-y-1.5 text-xs text-slate-600">
                    <div className="flex items-center gap-2">
                      <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span className="font-semibold text-slate-500">Current City:</span>
                      <span className="text-slate-800 font-medium">{u.currentCity}</span>
                    </div>

                    <div className="flex items-center gap-2">
                      <Briefcase className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span className="font-semibold text-slate-500">Job or Study:</span>
                      <span className="text-slate-800 font-medium truncate">{u.jobOrStudy}</span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Load more button */}
          {hasMore && (
            <div className="pt-2 text-center">
              <button
                type="button"
                disabled={loadingMore}
                onClick={() => fetchAlumni(selectedBatch, debouncedSearch, lastDoc, false)}
                className="inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-semibold shadow-xs transition-colors disabled:opacity-50 cursor-pointer"
              >
                {loadingMore ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-slate-600 border-t-transparent rounded-full animate-spin" />
                    <span>Loading more...</span>
                  </>
                ) : (
                  <span>Load more alumni</span>
                )}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
