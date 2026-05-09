import * as React from 'react';
import { useState, useEffect, useRef, useMemo } from 'react';
import { 
  collection, 
  onSnapshot, 
  doc, 
  setDoc, 
  addDoc, 
  serverTimestamp, 
  query, 
  orderBy, 
  limit,
  getDoc
} from 'firebase/firestore';
import { 
  signInWithPopup, 
  GoogleAuthProvider, 
  onAuthStateChanged, 
  User 
} from 'firebase/auth';
import { db, auth } from './firebase';
import { Html5Qrcode } from 'html5-qrcode';
import { 
  QrCode, 
  LayoutDashboard, 
  History, 
  Package, 
  User as UserIcon,
  LogOut,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  Clock,
  MapPin,
  Plus,
  Camera,
  RefreshCw,
  Settings,
  ChevronRight,
  PieChart,
  Search,
  Filter,
  ArrowUpDown,
  Printer
} from 'lucide-react';
import { format } from 'date-fns';
import { motion, AnimatePresence } from 'motion/react';

// Types
interface Rantang {
  id: string;
  status: string;
  lastLocation?: string;
  lastUpdated?: any;
  currentSekolahId?: string;
}

interface TrackingHistory {
  id: string;
  rantangId: string;
  oldStatus?: string;
  newStatus: string;
  action?: string;
  timestamp: any;
  operatorId?: string;
}

const STATUS_COLORS: Record<string, string> = {
  'Di Dapur (Bersih)': 'bg-emerald-100 text-emerald-700 border-emerald-200',
  'Siap Dikirim': 'bg-blue-100 text-blue-700 border-blue-200',
  'Dalam Perjalanan': 'bg-amber-100 text-amber-700 border-amber-200',
  'Di Sekolah': 'bg-purple-100 text-purple-700 border-purple-200',
  'Vacant Clean': 'bg-rose-100 text-rose-700 border-rose-200',
  'Proses Cuci': 'bg-cyan-100 text-cyan-700 border-cyan-200',
  'Di Pelanggan': 'bg-purple-100 text-purple-700 border-purple-200',
  'Penarikan Kotor': 'bg-rose-100 text-rose-700 border-rose-200',
};

const DISPLAY_STATUSES = [
  'Di Dapur (Bersih)',
  'Siap Dikirim',
  'Dalam Perjalanan',
  'Di Sekolah',
  'Vacant Clean',
  'Proses Cuci'
];

const ACTIONS = [
  'Makanan Terisi',
  'Scan oleh Kurir',
  'Diterima Sekolah',
  'Diambil Kurir',
  'Tiba di Dapur',
  'Selesai Dicuci'
];

const formatStatus = (status?: string) => {
  if (!status) return status;
  if (status === 'Di Pelanggan') return 'Di Sekolah';
  if (status === 'Penarikan Kotor') return 'Vacant Clean';
  return status;
};

// Error Boundary Component
interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: any;
}

export class ErrorBoundary extends React.Component<any, any> {
  state = { hasError: false, error: null };

  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }

  componentDidCatch(error: any, errorInfo: any) {
    console.error("ErrorBoundary caught an error", error, errorInfo);
  }

  render() {
    const { hasError, error } = (this as any).state;
    if (hasError) {
      return (
        <div className="min-h-screen bg-rose-50 flex items-center justify-center p-6">
          <div className="bg-white p-8 rounded-3xl shadow-xl max-w-md w-full text-center space-y-4 border border-rose-100">
            <div className="w-16 h-16 bg-rose-100 rounded-full flex items-center justify-center mx-auto text-rose-600">
              <AlertCircle className="w-8 h-8" />
            </div>
            <h1 className="text-2xl font-bold text-slate-900">Oops! Terjadi Kesalahan</h1>
            <p className="text-slate-600 text-sm">
              Aplikasi mengalami kendala teknis. Silakan muat ulang halaman.
            </p>
            <pre className="text-[10px] bg-slate-50 p-3 rounded-lg text-left overflow-auto max-h-32 text-slate-400">
              {error?.message || String(error)}
            </pre>
            <button 
              onClick={() => window.location.reload()}
              className="w-full py-3 bg-rose-600 text-white font-bold rounded-xl hover:bg-rose-700 transition-colors"
            >
              Muat Ulang Halaman
            </button>
          </div>
        </div>
      );
    }
    return (this as any).props.children;
  }
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'scanner' | 'history' | 'analytics' | 'settings'>('dashboard');
  const [rantangs, setRantangs] = useState<Rantang[]>([]);
  const [history, setHistory] = useState<TrackingHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showRegisterModal, setShowRegisterModal] = useState(false);
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [newRantangId, setNewRantangId] = useState('');
  const [viewingQrId, setViewingQrId] = useState<string | null>(null);
  
  // Scanner state
  const [scannedId, setScannedId] = useState<string | null>(null);
  const [selectedAction, setSelectedAction] = useState<string>('');
  const [scannerError, setScannerError] = useState<string | null>(null);
  const [isScannerStarted, setIsScannerStarted] = useState(false);
  const [isFlipped, setIsFlipped] = useState(false);
  const [cameras, setCameras] = useState<{id: string, label: string}[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string>('');
  const [isScannerInitializing, setIsScannerInitializing] = useState(false);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const isMounted = useRef(true);

  // History tab state
  const [historySearch, setHistorySearch] = useState('');
  const [historyFilterAction, setHistoryFilterAction] = useState('Semua Aksi');
  const [historySortDirection, setHistorySortDirection] = useState<'desc' | 'asc'>('desc');

  const filteredHistory = useMemo(() => {
    return history
      .filter(item => {
        const mappedNew = formatStatus(item.newStatus) || item.newStatus;
        const mappedOld = item.oldStatus ? formatStatus(item.oldStatus) : null;
        const matchesSearch = item.rantangId.toLowerCase().includes(historySearch.toLowerCase()) || 
                              mappedNew.toLowerCase().includes(historySearch.toLowerCase()) ||
                              (mappedOld && mappedOld.toLowerCase().includes(historySearch.toLowerCase()));
        const matchesAction = historyFilterAction === 'Semua Aksi' || item.action === historyFilterAction;
        return matchesSearch && matchesAction;
      })
      .sort((a, b) => {
        const dateA = new Date(a.timestamp).getTime();
        const dateB = new Date(b.timestamp).getTime();
        return historySortDirection === 'desc' ? dateB - dateA : dateA - dateB;
      });
  }, [history, historySearch, historyFilterAction, historySortDirection]);

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    // Initialize with all possible statuses from DISPLAY_STATUSES
    DISPLAY_STATUSES.forEach(status => {
      counts[status] = 0;
    });
    // Count current rantangs
    rantangs.forEach(r => {
      const mappedStatus = formatStatus(r.status);

      if (counts[mappedStatus] !== undefined) {
        counts[mappedStatus]++;
      }
    });
    return counts;
  }, [rantangs]);

  useEffect(() => {
    document.title = "Gian Skripsi Project";
  }, []);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  useEffect(() => {
    const handleError = (event: ErrorEvent) => {
      const msg = event.message || "";
      
      // Filter out benign browser/library errors and noise
      if (msg.includes("play() request was interrupted") || 
          msg.includes("The media was removed from the document") ||
          msg.toLowerCase().includes("uncaught") ||
          msg === "Script error." ||
          !msg) {
        return;
      }

      console.error("Global Error Caught:", event);
      
      // Only show UI error for critical JSON/System failures
      if (msg.includes("is not valid JSON") || msg.includes("Unexpected token")) {
        setError(`Terjadi kesalahan sistem (JSON Parse Error). Silakan muat ulang halaman. Detail: ${msg}`);
      }
    };

    const handleRejection = (event: PromiseRejectionEvent) => {
      // Prevent the default browser UI or framework overlays for unhandled rejections
      event.preventDefault();

      // Safely extract reason string
      let reason = "";
      try {
        reason = event.reason?.message || String(event.reason);
      } catch (e) {
        reason = "Unknown rejection";
      }
      
      // Filter out noise and common benign errors
      const noiseStrings = [
        "play() request was interrupted",
        "The media was removed from the document",
        "scan is ongoing",
        "close it first",
        "uncaught",
        "not scanning",
        "removeChild",
        "alert-check",
        "Script error",
        "undefined",
        "null",
        "Permission denied",
        "Requested device not found",
        "Already scanning",
        "ongoing",
        "interrupted",
        "AbortError",
        "JSON"
      ];

      if (!event.reason || noiseStrings.some(str => reason.toLowerCase().includes(str.toLowerCase()))) {
        return;
      }

      console.warn("Unhandled Promise Rejection:", event.reason);
      
      if (reason.includes("is not valid JSON") || reason.includes("Unexpected token")) {
        setError(`Terjadi kesalahan sistem (Promise JSON Error). Detail: ${reason}`);
      }
    };
    window.addEventListener('error', handleError);
    window.addEventListener('unhandledrejection', handleRejection);
    return () => {
      window.removeEventListener('error', handleError);
      window.removeEventListener('unhandledrejection', handleRejection);
    };
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;

    const qRantangs = collection(db, 'rantang');
    const unsubRantangs = onSnapshot(qRantangs, (snapshot) => {
      try {
        const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Rantang));
        setRantangs(data);
      } catch (err) {
        console.error("Error mapping rantangs:", err);
      }
    }, (err) => {
      console.error("Firestore Rantangs Error:", err);
      setError("Gagal memuat data rantang: " + err.message);
    });

    const qHistory = query(collection(db, 'tracking_history'), orderBy('timestamp', 'desc'), limit(50));
    const unsubHistory = onSnapshot(qHistory, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as TrackingHistory));
      setHistory(data);
    }, (err) => {
      console.error("Firestore History Error:", err);
    });

    return () => {
      unsubRantangs();
      unsubHistory();
    };
  }, [user]);

  const handleLogin = async () => {
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (err) {
      console.error(err);
      setError("Gagal login dengan Google");
    }
  };

  const handleLogout = () => {
    auth.signOut().catch(err => {
      console.error("Logout error:", err);
      setError("Gagal keluar dari akun");
    });
  };

  // Scanner lifecycle
  const stopScanner = async () => {
    if (scannerRef.current) {
      try {
        if (scannerRef.current.isScanning) {
          try {
            await scannerRef.current.stop();
          } catch (stopErr) {
            // Ignore stop errors, proceed to clear
          }
        }
        
        // Wait a bit more to ensure stop is fully processed by browser
        await new Promise(resolve => setTimeout(resolve, 150));
        
        try {
          const element = document.getElementById("reader");
          if (element) {
            await scannerRef.current.clear();
          }
        } catch (e) {
          // Ignore clear errors
        }
        
        if (isMounted.current) setIsScannerStarted(false);
      } catch (err: any) {
        const msg = err?.message || String(err);
        if (
          msg.includes("removeChild") || 
          msg.includes("not a child") || 
          msg.includes("not scanning") ||
          msg.includes("play() request") ||
          msg.includes("ongoing")
        ) {
          if (isMounted.current) setIsScannerStarted(false);
          return;
        }
        console.warn("Scanner stop warning:", err);
      }
    }
  };

  const startScanner = async (cameraId?: string) => {
    if (isScannerInitializing) return;
    
    setIsScannerInitializing(true);
    setScannerError(null);
    
    try {
      const element = document.getElementById("reader");
      if (!element) {
        setIsScannerInitializing(false);
        return;
      }

      if (!scannerRef.current) {
        scannerRef.current = new Html5Qrcode("reader");
      }

      // If already scanning, stop it properly first and wait
      if (scannerRef.current.isScanning) {
        try {
          await scannerRef.current.stop();
          try {
            await scannerRef.current.clear();
          } catch (e) {}
          await new Promise(resolve => setTimeout(resolve, 200)); // More state settle time
        } catch (e) {
          console.warn("Pre-start stop failed:", e);
        }
      }

      if (!isMounted.current) {
        setIsScannerInitializing(false);
        return;
      }

      // Get cameras if not already fetched
      let devices = cameras;
      if (devices.length === 0) {
        const fetchedDevices = await Html5Qrcode.getCameras();
        if (fetchedDevices && fetchedDevices.length > 0) {
          devices = fetchedDevices.map(d => ({ id: d.id, label: d.label }));
          if (isMounted.current) setCameras(devices);
        } else {
          throw new Error("Tidak ada kamera ditemukan. Pastikan izin kamera diberikan.");
        }
      }

      let targetId = cameraId || selectedCameraId;
      if (!targetId && devices.length > 0) {
        const backCamera = devices.find(d => 
          d.label.toLowerCase().includes('back') || 
          d.label.toLowerCase().includes('rear') ||
          d.label.toLowerCase().includes('environment')
        );
        targetId = backCamera ? backCamera.id : devices[0].id;
        if (isMounted.current) setSelectedCameraId(targetId);
      }

      if (!targetId) throw new Error("Kamera belum dipilih.");
      if (!isMounted.current) {
        setIsScannerInitializing(false);
        return;
      }

      console.log("Starting scanner with cameraId:", targetId);
      
      await scannerRef.current.start(
        targetId,
        {
          fps: 10,
          qrbox: { width: 250, height: 250 },
        },
        (decodedText) => {
          if (isMounted.current) {
            setScannedId(decodedText);
            stopScanner().catch(() => {});
          }
        },
        () => {}
      );

      if (isMounted.current) setIsScannerStarted(true);
    } catch (err: any) {
      const msg = err?.message || String(err);
      if (msg.includes("play() request was interrupted") || msg.includes("The media was removed")) {
        return;
      }
      if (isMounted.current) {
        setScannerError(msg || "Gagal mengakses kamera.");
      }
      console.error("Scanner Start Error:", err);
    } finally {
      if (isMounted.current) setIsScannerInitializing(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'scanner' && !scannedId) {
      // Auto start scanner when tab is active
      const timer = setTimeout(() => {
        if (isMounted.current) startScanner().catch(() => {});
      }, 500);
      return () => {
        clearTimeout(timer);
        stopScanner().catch(() => {});
      };
    } else if (activeTab !== 'scanner') {
      stopScanner().catch(() => {});
    }
  }, [activeTab, scannedId]);

  const processTransition = async () => {
    if (!scannedId || !selectedAction) return;

    try {
      setError(null);
      setSuccess(null);

      // 1. Get current status
      const rantangDoc = await getDoc(doc(db, 'rantang', scannedId));
      let currentStatus = 'Di Dapur (Bersih)'; // Default for new rantang
      
      if (rantangDoc.exists()) {
        currentStatus = rantangDoc.data().status;
      }

      // 2. Forward Chaining Logic (Client-side)
      const RULES = [
        { current: 'Di Dapur (Bersih)', action: 'Makanan Terisi', next: 'Siap Dikirim' },
        { current: 'Siap Dikirim', action: 'Scan oleh Kurir', next: 'Dalam Perjalanan' },
        { current: 'Dalam Perjalanan', action: 'Diterima Sekolah', next: 'Di Sekolah' },
        { current: 'Di Sekolah', action: 'Diambil Kurir', next: 'Vacant Clean' },
        { current: 'Vacant Clean', action: 'Tiba di Dapur', next: 'Proses Cuci' },
        { current: 'Proses Cuci', action: 'Selesai Dicuci', next: 'Di Dapur (Bersih)' },
      ];

      const rule = RULES.find(r => r.current === currentStatus && r.action === selectedAction);
      
      if (!rule) {
        throw new Error(`Transisi tidak valid: Aksi '${selectedAction}' tidak diperbolehkan untuk status '${currentStatus}'`);
      }

      const newStatus = rule.next;
      const timestamp = new Date().toISOString();

      // 3. Update Firestore
      await setDoc(doc(db, 'rantang', scannedId), {
        id: scannedId,
        status: newStatus,
        lastUpdated: timestamp,
        operatorId: user?.uid
      }, { merge: true });

      await addDoc(collection(db, 'tracking_history'), {
        rantangId: scannedId,
        oldStatus: currentStatus,
        newStatus: newStatus,
        action: selectedAction,
        timestamp: timestamp,
        operatorId: user?.uid
      });

      setSuccess(`Berhasil! Status rantang ${scannedId} sekarang: ${newStatus}`);
      setScannedId(null);
      setSelectedAction('');
      setActiveTab('dashboard');
    } catch (err: any) {
      setError(err.message);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600"></div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 p-4">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 text-center border border-slate-100"
        >
          <div className="w-20 h-20 bg-emerald-100 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <Package className="w-10 h-10 text-emerald-600" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mb-2">MBG Rantang Tracker</h1>
          <p className="text-slate-500 mb-8">Sistem pelacakan rantang berbasis QR Code & Forward Chaining</p>
          <button 
            onClick={handleLogin}
            className="w-full flex items-center justify-center gap-3 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-3 px-6 rounded-xl transition-all shadow-lg shadow-emerald-200"
          >
            <UserIcon className="w-5 h-5" />
            Masuk dengan Google
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <>
    <div className="min-h-screen bg-slate-50 pb-24 lg:pb-0 lg:pl-64 print:hidden">
      {/* Sidebar Desktop */}
      <aside className="fixed left-0 top-0 bottom-0 w-64 bg-white border-r border-slate-200 hidden lg:flex flex-col p-6">
        <div className="flex items-center gap-3 mb-10">
          <div className="w-10 h-10 bg-emerald-600 rounded-lg flex items-center justify-center">
            <Package className="w-6 h-6 text-white" />
          </div>
          <span className="font-bold text-xl text-slate-900">MBG Tracker</span>
        </div>

        <nav className="flex-1 space-y-2">
          <NavItem 
            active={activeTab === 'dashboard'} 
            onClick={() => setActiveTab('dashboard')}
            icon={<LayoutDashboard className="w-5 h-5" />}
            label="Dashboard"
          />
          <NavItem 
            active={activeTab === 'analytics'} 
            onClick={() => setActiveTab('analytics')}
            icon={<PieChart className="w-5 h-5" />}
            label="Monitoring"
          />
          <NavItem 
            active={activeTab === 'scanner'} 
            onClick={() => setActiveTab('scanner')}
            icon={<QrCode className="w-5 h-5" />}
            label="Scan QR"
          />
          <NavItem 
            active={activeTab === 'history'} 
            onClick={() => setActiveTab('history')}
            icon={<History className="w-5 h-5" />}
            label="Riwayat"
          />
          <NavItem 
            active={activeTab === 'settings'} 
            onClick={() => setActiveTab('settings')}
            icon={<Settings className="w-5 h-5" />}
            label="Pengaturan"
          />
        </nav>

        <div className="mt-auto pt-6 border-t border-slate-100">
          <div className="flex items-center gap-3 mb-4">
            <img src={user.photoURL || ''} className="w-10 h-10 rounded-full" alt="" referrerPolicy="no-referrer" />
            <div className="overflow-hidden">
              <p className="text-sm font-semibold text-slate-900 truncate">{user.displayName}</p>
              <p className="text-xs text-slate-500 truncate">{user.email}</p>
            </div>
          </div>
          <button 
            onClick={handleLogout}
            className="w-full flex items-center gap-2 text-rose-600 hover:bg-rose-50 p-2 rounded-lg transition-colors text-sm font-medium"
          >
            <LogOut className="w-4 h-4" />
            Keluar
          </button>
        </div>
      </aside>

      {/* Mobile Header */}
      <header className="lg:hidden bg-white border-b border-slate-200 p-4 sticky top-0 z-10 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Package className="w-6 h-6 text-emerald-600" />
          <span className="font-bold text-lg">MBG Tracker</span>
        </div>
        <img src={user.photoURL || ''} className="w-8 h-8 rounded-full" alt="" referrerPolicy="no-referrer" />
      </header>

      {/* Main Content */}
      <main className="p-4 lg:p-8 max-w-6xl mx-auto">
        <AnimatePresence mode="wait">
          {activeTab === 'dashboard' && (
            <motion.div 
              key="dashboard"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-6"
            >
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <h2 className="text-2xl font-bold text-slate-900">Unit Rantang</h2>
                  <p className="text-slate-500">Monitor keberadaan seluruh unit rantang</p>
                </div>
                <div className="flex gap-2 flex-wrap md:flex-nowrap">
                  <button 
                    onClick={() => setShowRegisterModal(true)}
                    className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-xl font-semibold transition-all shadow-sm flex-1 md:flex-none justify-center"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Registrasi Baru</span>
                  </button>
                  <button 
                    onClick={() => setActiveTab('analytics')}
                    className="bg-white px-4 py-2 rounded-xl border border-slate-200 shadow-sm flex flex-col items-start hover:bg-slate-50 transition-colors"
                  >
                    <span className="text-xs text-slate-500 block">Total Unit</span>
                    <span className="text-xl font-bold text-emerald-600">{rantangs.length}</span>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {rantangs.map((rantang) => (
                  <div key={rantang.id} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
                    <div className="flex justify-between items-start mb-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-slate-100 rounded-lg flex items-center justify-center">
                          <Package className="w-6 h-6 text-slate-600" />
                        </div>
                        <div>
                          <h3 className="font-bold text-slate-900">{rantang.id}</h3>
                          <p className="text-xs text-slate-400">ID Unit</p>
                        </div>
                      </div>
                      <span className={`px-3 py-1 rounded-full text-xs font-semibold border ${STATUS_COLORS[formatStatus(rantang.status) || ''] || 'bg-slate-100'}`}>
                        {formatStatus(rantang.status)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between mt-4 pt-4 border-t border-slate-50">
                      <div className="flex items-center gap-2 text-xs text-slate-500">
                        <Clock className="w-3.5 h-3.5" />
                        Update: {rantang.lastUpdated ? format(new Date(rantang.lastUpdated), 'dd MMM, HH:mm') : '-'}
                      </div>
                      <button 
                        onClick={() => setViewingQrId(rantang.id)}
                        className="flex items-center gap-1.5 text-xs font-bold text-emerald-600 hover:bg-emerald-50 px-2 py-1 rounded-lg transition-colors"
                      >
                        <QrCode className="w-3.5 h-3.5" />
                        Lihat QR
                      </button>
                    </div>
                  </div>
                ))}
                {rantangs.length === 0 && (
                  <div className="col-span-full py-20 text-center bg-white rounded-2xl border-2 border-dashed border-slate-200">
                    <Package className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                    <p className="text-slate-500">Belum ada data rantang. Mulai dengan scan QR!</p>
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {activeTab === 'analytics' && (
            <motion.div 
              key="analytics"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-8"
            >
              <div>
                <h2 className="text-2xl font-bold text-slate-900">Monitoring Status</h2>
                <p className="text-slate-500">Ringkasan distribusi rantang berdasarkan status saat ini</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {DISPLAY_STATUSES.map((status) => {
                  const colorClass = STATUS_COLORS[status];
                  return (
                  <div key={status} className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex flex-col group hover:shadow-md transition-all">
                    <div className="flex justify-between items-start mb-4">
                      <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${colorClass.split(' ')[0]} ${colorClass.split(' ')[1]}`}>
                        {status === 'Di Dapur (Bersih)' && <CheckCircle2 className="w-6 h-6" />}
                        {status === 'Siap Dikirim' && <Package className="w-6 h-6" />}
                        {status === 'Dalam Perjalanan' && <ArrowRight className="w-6 h-6" />}
                        {status === 'Di Sekolah' && <MapPin className="w-6 h-6" />}
                        {status === 'Vacant Clean' && <AlertCircle className="w-6 h-6" />}
                        {status === 'Proses Cuci' && <RefreshCw className="w-6 h-6" />}
                      </div>
                      <span className="text-4xl font-black text-slate-900 opacity-20 group-hover:opacity-40 transition-opacity">
                        {statusCounts[status] || 0}
                      </span>
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-slate-900 mb-1">{status}</h3>
                      <p className="text-sm text-slate-500">
                        {status === 'Di Dapur (Bersih)' && 'Rantang sudah dicuci dan siap digunakan.'}
                        {status === 'Siap Dikirim' && 'Rantang menunggu diangkut oleh kurir.'}
                        {status === 'Dalam Perjalanan' && 'Rantang sedang dalam pengantaran ke sekolah.'}
                        {status === 'Di Sekolah' && 'Rantang berada di sekolah.'}
                        {status === 'Vacant Clean' && 'Rantang menunggu diambil oleh kurir.'}
                        {status === 'Proses Cuci' && 'Rantang sedang dalam proses pencucian.'}
                      </p>
                    </div>
                    <div className="mt-6 pt-4 border-t border-slate-50 flex items-center justify-between">
                      <span className="text-2xl font-bold text-emerald-600">
                        {statusCounts[status] || 0} <span className="text-sm font-medium text-slate-400">Unit</span>
                      </span>
                      <div className="w-24 h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div 
                          className={`h-full ${colorClass.split(' ')[0]}`} 
                          style={{ width: `${rantangs.length > 0 ? ((statusCounts[status] || 0) / rantangs.length) * 100 : 0}%` }}
                        />
                      </div>
                    </div>
                  </div>
                )})}
              </div>
            </motion.div>
          )}

          {activeTab === 'scanner' && (
            <motion.div 
              key="scanner"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="max-w-2xl mx-auto space-y-6"
            >
              <div className="text-center">
                <h2 className="text-2xl font-bold text-slate-900">Scan QR Code</h2>
                <p className="text-slate-500">Arahkan kamera ke QR Code pada rantang</p>
              </div>

              <div className="bg-white p-6 rounded-3xl shadow-xl border border-slate-100 overflow-hidden min-h-[400px] flex flex-col items-center">
                {!scannedId ? (
                  <div className="w-full space-y-6">
                    {/* Camera Selection UI */}
                    <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-100">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 bg-emerald-100 rounded-lg flex items-center justify-center text-emerald-600">
                          <Settings className="w-4 h-4" />
                        </div>
                        <span className="text-sm font-bold text-slate-700">Pengaturan Kamera</span>
                      </div>
                      
                      <div className="flex items-center gap-2">
                        <select 
                          value={selectedCameraId}
                          onChange={(e) => {
                            setSelectedCameraId(e.target.value);
                            startScanner(e.target.value).catch(() => {});
                          }}
                          className="text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-emerald-500 max-w-[150px] md:max-w-none"
                        >
                          {cameras.length === 0 && <option value="">Mencari Kamera...</option>}
                          {cameras.map(cam => (
                            <option key={cam.id} value={cam.id}>{cam.label || `Kamera ${cam.id.slice(0, 4)}`}</option>
                          ))}
                        </select>
                        
                        <button 
                          onClick={() => startScanner().catch(() => {})}
                          disabled={isScannerInitializing}
                          className="p-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50"
                          title="Refresh Kamera"
                        >
                          <RefreshCw className={`w-4 h-4 ${isScannerInitializing ? 'animate-spin' : ''}`} />
                        </button>
                      </div>
                    </div>

                    <div className="relative group w-full">
                      <div className="relative w-full rounded-2xl overflow-hidden bg-slate-950 flex flex-col items-center justify-center min-h-[300px]">
                        {/* The actual scanner div - MUST BE EMPTY for React to not conflict */}
                        <div 
                          id="reader" 
                          className={`w-full [&_video]:w-full ${isFlipped ? '[&_video]:scale-x-[-1]' : ''}`}
                        ></div>

                        {/* React-managed overlays - OUTSIDE the reader div */}
                        {isScannerInitializing && (
                          <div className="absolute inset-0 flex flex-col items-center justify-center text-emerald-500 bg-slate-950/80 backdrop-blur-sm z-20">
                            <RefreshCw className="w-10 h-10 mb-4 animate-spin" />
                            <p className="text-sm font-medium">Menyiapkan Kamera...</p>
                          </div>
                        )}
                        {!isScannerStarted && !isScannerInitializing && (
                          <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-500 p-8">
                            <Camera className="w-12 h-12 mb-4 opacity-20" />
                            <p className="text-sm">Kamera tidak aktif</p>
                          </div>
                        )}
                      </div>
                      
                      {isScannerStarted && (
                        <div className="absolute top-4 right-4 flex gap-2 z-10">
                          <button 
                            onClick={() => setIsFlipped(!isFlipped)}
                            className="bg-white/90 backdrop-blur-sm p-2.5 rounded-xl shadow-lg hover:bg-white transition-all flex items-center gap-2 text-xs font-bold text-slate-700 border border-slate-200"
                          >
                            <RefreshCw className={`w-4 h-4 ${isFlipped ? 'rotate-180' : ''}`} />
                            Mirror
                          </button>
                        </div>
                      )}

                      {/* Scanning Overlay */}
                      {isScannerStarted && (
                        <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                          <div className="w-64 h-64 border-2 border-emerald-500/50 rounded-3xl relative">
                            <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-emerald-500 rounded-tl-xl"></div>
                            <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-emerald-500 rounded-tr-xl"></div>
                            <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-emerald-500 rounded-bl-xl"></div>
                            <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-emerald-500 rounded-br-xl"></div>
                            <div className="absolute inset-x-0 top-1/2 h-0.5 bg-emerald-500/30 animate-pulse shadow-[0_0_15px_rgba(16,185,129,0.5)]"></div>
                          </div>
                        </div>
                      )}
                    </div>
                    
                    {!isScannerStarted && !isScannerInitializing && (
                      <div className="flex flex-col gap-3">
                        <button 
                          onClick={() => startScanner()}
                          className="w-full flex items-center justify-center gap-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-4 px-6 rounded-2xl transition-all shadow-lg shadow-emerald-200"
                        >
                          <Camera className="w-5 h-5" />
                          Aktifkan Kamera
                        </button>
                        <p className="text-center text-xs text-slate-400">
                          Klik tombol di atas jika kamera tidak otomatis terbuka
                        </p>
                      </div>
                    )}

                    {scannerError && (
                      <div className="bg-rose-50 p-4 rounded-2xl border border-rose-100 flex flex-col items-center text-center gap-3">
                        <AlertCircle className="w-10 h-10 text-rose-500" />
                        <div>
                          <p className="text-rose-700 font-bold text-sm">Masalah Kamera</p>
                          <p className="text-rose-600 text-xs">{scannerError}</p>
                        </div>
                        <button 
                          onClick={() => startScanner()}
                          className="text-xs font-bold bg-rose-600 text-white px-4 py-2 rounded-lg"
                        >
                          Coba Lagi
                        </button>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-6">
                    <div className="bg-emerald-50 p-4 rounded-2xl border border-emerald-100 flex items-center gap-4">
                      <CheckCircle2 className="w-8 h-8 text-emerald-600" />
                      <div>
                        <p className="text-xs text-emerald-600 font-bold uppercase tracking-wider">QR Terdeteksi</p>
                        <p className="text-xl font-bold text-slate-900">{scannedId}</p>
                      </div>
                      <button 
                        onClick={() => setScannedId(null)}
                        className="ml-auto text-sm text-emerald-600 font-semibold hover:underline"
                      >
                        Ulangi
                      </button>
                    </div>

                    <div className="space-y-3">
                      <label className="text-sm font-bold text-slate-700 block">Pilih Aksi:</label>
                      <div className="grid grid-cols-2 gap-2">
                        {ACTIONS.map((action) => (
                          <button
                            key={action}
                            onClick={() => setSelectedAction(action)}
                            className={`p-3 rounded-xl border-2 text-sm font-medium transition-all ${
                              selectedAction === action 
                                ? 'border-emerald-600 bg-emerald-50 text-emerald-700' 
                                : 'border-slate-100 hover:border-slate-200 text-slate-600'
                            }`}
                          >
                            {action}
                          </button>
                        ))}
                      </div>
                    </div>

                    {error && (
                      <div className="bg-rose-50 p-4 rounded-xl border border-rose-100 flex items-start gap-3 text-rose-700 text-sm">
                        <AlertCircle className="w-5 h-5 shrink-0" />
                        {error}
                      </div>
                    )}

                    <div className="flex gap-3">
                      <button
                        onClick={() => setScannedId(null)}
                        className="flex-1 py-4 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold rounded-2xl transition-all"
                      >
                        Batal
                      </button>
                      <button
                        onClick={processTransition}
                        disabled={!selectedAction}
                        className="flex-[2] py-4 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-2xl shadow-lg shadow-emerald-200 transition-all flex items-center justify-center gap-2"
                      >
                        Update Status
                        <ArrowRight className="w-5 h-5" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {activeTab === 'history' && (
            <motion.div 
              key="history"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-6"
            >
              <div>
                <h2 className="text-2xl font-bold text-slate-900">Riwayat Pelacakan</h2>
                <p className="text-slate-500">Log aktivitas pergerakan rantang</p>
              </div>

              <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row gap-4">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
                  <input
                    type="text"
                    placeholder="Cari ID, status..."
                    value={historySearch}
                    onChange={(e) => setHistorySearch(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all"
                  />
                </div>
                
                <div className="flex gap-4">
                  <div className="relative flex-1 md:w-48">
                    <Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
                    <select
                      value={historyFilterAction}
                      onChange={(e) => setHistoryFilterAction(e.target.value)}
                      className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all appearance-none"
                    >
                      <option value="Semua Aksi">Semua Aksi</option>
                      {ACTIONS.map(action => (
                        <option key={action} value={action}>{action}</option>
                      ))}
                    </select>
                  </div>
                  
                  <button
                    onClick={() => setHistorySortDirection(prev => prev === 'desc' ? 'asc' : 'desc')}
                    className="flex items-center justify-center gap-2 px-4 py-2 border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors text-slate-700 whitespace-nowrap"
                  >
                    <ArrowUpDown className="w-5 h-5" />
                    <span className="hidden sm:inline">{historySortDirection === 'desc' ? 'Terbaru' : 'Terlama'}</span>
                  </button>
                </div>
              </div>

              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200">
                        <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Waktu</th>
                        <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Unit ID</th>
                        <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Aksi</th>
                        <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Transisi Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredHistory.map((item) => (
                        <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                          <td className="px-6 py-4 text-sm text-slate-600 whitespace-nowrap">
                            {format(new Date(item.timestamp), 'dd/MM HH:mm')}
                          </td>
                          <td className="px-6 py-4 text-sm font-bold text-slate-900">
                            {item.rantangId}
                          </td>
                          <td className="px-6 py-4">
                            <span className="text-sm font-medium text-slate-700 bg-slate-100 px-2 py-1 rounded">
                              {item.action}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-2 text-xs">
                              <span className="text-slate-400 line-through">{formatStatus(item.oldStatus)}</span>
                              <ArrowRight className="w-3 h-3 text-slate-300" />
                              <span className={`px-2 py-0.5 rounded-full font-semibold border ${STATUS_COLORS[formatStatus(item.newStatus) || '']}`}>
                                {formatStatus(item.newStatus)}
                              </span>
                            </div>
                          </td>
                        </tr>
                      ))}
                      {filteredHistory.length === 0 && (
                        <tr>
                          <td colSpan={4} className="px-6 py-10 text-center text-slate-400">
                            {history.length === 0 ? "Belum ada riwayat aktivitas." : "Tidak ada hasil yang cocok dengan pencarian Anda."}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'settings' && (
            <motion.div
              key="settings"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-6"
            >
              <h2 className="text-2xl font-bold text-slate-900 mb-6">Pengaturan</h2>
              
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <div>
                  <h3 className="text-lg font-bold text-slate-800 mb-1">Cetak QR Code Unit</h3>
                  <p className="text-slate-500 text-sm">Cetak seluruh QR code rantang yang terdaftar</p>
                </div>
                <button 
                  onClick={() => setShowPrintModal(true)}
                  className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 rounded-xl font-semibold transition-all shadow-sm w-full md:w-auto justify-center"
                >
                  <Printer className="w-5 h-5" />
                  Cetak QR
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Mobile Nav */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 px-6 py-3 flex justify-between items-center z-10">
        <MobileNavItem 
          active={activeTab === 'dashboard'} 
          onClick={() => setActiveTab('dashboard')}
          icon={<LayoutDashboard className="w-6 h-6" />}
          label="Home"
        />
        <MobileNavItem 
          active={activeTab === 'analytics'} 
          onClick={() => setActiveTab('analytics')}
          icon={<PieChart className="w-6 h-6" />}
          label="Status"
        />
        <button 
          onClick={() => setActiveTab('scanner')}
          className={`w-14 h-14 rounded-full flex items-center justify-center -mt-10 shadow-lg transition-all ${
            activeTab === 'scanner' ? 'bg-emerald-600 text-white scale-110' : 'bg-white text-slate-600 border border-slate-200'
          }`}
        >
          <QrCode className="w-7 h-7" />
        </button>
        <MobileNavItem 
          active={activeTab === 'history'} 
          onClick={() => setActiveTab('history')}
          icon={<History className="w-6 h-6" />}
          label="History"
        />
        <MobileNavItem 
          active={activeTab === 'settings'} 
          onClick={() => setActiveTab('settings')}
          icon={<Settings className="w-6 h-6" />}
          label="Settings"
        />
      </nav>

      {/* Success Notification */}
      <AnimatePresence>
        {showRegisterModal && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[60] flex items-center justify-center p-4"
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="bg-white rounded-3xl p-8 max-w-sm w-full shadow-2xl"
            >
              <h3 className="text-xl font-bold text-slate-900 mb-4">Registrasi Rantang Baru</h3>
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-bold text-slate-700 block mb-1">ID Rantang (Contoh: MBG-001)</label>
                  <input 
                    type="text" 
                    value={newRantangId}
                    onChange={(e) => setNewRantangId(e.target.value.toUpperCase())}
                    placeholder="Masukkan ID..."
                    className="w-full p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                  />
                </div>

                {newRantangId && (
                  <div className="bg-slate-50 p-6 rounded-2xl flex flex-col items-center gap-4 border border-slate-100">
                    <img 
                      src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${newRantangId}`} 
                      alt="QR Code"
                      className="w-32 h-32 shadow-sm bg-white p-2 rounded-lg"
                      referrerPolicy="no-referrer"
                    />
                    <p className="text-xs text-slate-500 text-center">Scan QR di atas untuk mulai melacak unit ini</p>
                  </div>
                )}

                <div className="flex gap-3 pt-2">
                  <button 
                    onClick={() => { setShowRegisterModal(false); setNewRantangId(''); }}
                    className="flex-1 py-3 text-slate-600 font-semibold hover:bg-slate-50 rounded-xl transition-colors"
                  >
                    Tutup
                  </button>
                  <button 
                    disabled={!newRantangId}
                    onClick={async () => {
                      try {
                        await setDoc(doc(db, 'rantang', newRantangId), {
                          id: newRantangId,
                          status: 'Di Dapur (Bersih)',
                          lastUpdated: new Date().toISOString()
                        });
                        setSuccess(`Rantang ${newRantangId} berhasil didaftarkan!`);
                        setShowRegisterModal(false);
                        setNewRantangId('');
                      } catch (err) {
                        setError("Gagal mendaftarkan rantang");
                      }
                    }}
                    className="flex-1 py-3 bg-emerald-600 text-white font-semibold rounded-xl hover:bg-emerald-700 disabled:opacity-50 transition-all"
                  >
                    Simpan
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* View QR Modal */}
      <AnimatePresence>
        {viewingQrId && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[60] flex items-center justify-center p-4"
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="bg-white rounded-3xl p-8 max-w-sm w-full shadow-2xl text-center"
            >
              <div className="w-16 h-16 bg-emerald-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <QrCode className="w-8 h-8 text-emerald-600" />
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-1">QR Code Unit</h3>
              <p className="text-sm text-slate-500 mb-6">ID: <span className="font-bold text-slate-900">{viewingQrId}</span></p>
              
              <div className="bg-slate-50 p-6 rounded-2xl flex flex-col items-center gap-4 border border-slate-100 mb-6">
                <img 
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${viewingQrId}`} 
                  alt="QR Code"
                  className="w-40 h-40 shadow-sm bg-white p-2 rounded-lg"
                  referrerPolicy="no-referrer"
                />
              </div>

              <button 
                onClick={() => setViewingQrId(null)}
                className="w-full py-3 bg-slate-900 text-white font-bold rounded-xl hover:bg-slate-800 transition-all"
              >
                Tutup
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Success Notification */}
      <AnimatePresence>
        {success && (
          <motion.div 
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className="fixed bottom-24 left-4 right-4 lg:left-auto lg:right-8 lg:bottom-8 lg:max-w-md bg-emerald-600 text-white p-4 rounded-2xl shadow-2xl flex items-center gap-4 z-[200]"
          >
            <CheckCircle2 className="w-6 h-6 shrink-0" />
            <p className="text-sm font-medium">{success}</p>
            <button onClick={() => setSuccess(null)} className="ml-auto opacity-70 hover:opacity-100">
              <Plus className="w-5 h-5 rotate-45" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>

      {/* Print Modal Overlay */}
      {showPrintModal && (
        <div className="fixed inset-0 z-[100] bg-slate-50 overflow-y-auto print:bg-white text-slate-900">
          <div className="max-w-5xl mx-auto p-4 sm:p-8">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-8 print:hidden bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
              <div className="flex-1">
                <h2 className="text-2xl sm:text-3xl font-bold mb-2">Cetak QR Code</h2>
                <p className="text-slate-500 text-sm sm:text-base">
                  Tekan <kbd className="bg-slate-100 px-2 py-1 rounded text-slate-800 font-mono">Ctrl</kbd> + <kbd className="bg-slate-100 px-2 py-1 rounded text-slate-800 font-mono">P</kbd> (Windows) atau <kbd className="bg-slate-100 px-2 py-1 rounded text-slate-800 font-mono">Cmd</kbd> + <kbd className="bg-slate-100 px-2 py-1 rounded text-slate-800 font-mono">P</kbd> (Mac) untuk mencetak.
                  <br/>Jika tombol cetak tidak beraksi (karena limitasi iFrame), gunakan pintasan keyboard di atas atau buka Tab Baru.
                </p>
              </div>
              <div className="flex flex-wrap sm:flex-nowrap gap-3 w-full md:w-auto shrink-0">
                <button
                  onClick={() => setShowPrintModal(false)}
                  className="flex-1 sm:flex-none px-6 py-3 border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold rounded-xl transition-all text-center whitespace-nowrap"
                >
                  Tutup
                </button>
                <button
                  onClick={() => {
                    try {
                      window.print();
                      setTimeout(() => {
                        setSuccess("Jika dialog cetak tidak muncul, gunakan pintasan keyboard Ctrl+P / Cmd+P atau buka aplikasi di Tab Baru.");
                      }, 500);
                    } catch (e) {
                      setSuccess("Gunakan pintasan keyboard Ctrl+P / Cmd+P untuk mencetak.");
                    }
                  }}
                  className="flex-1 sm:flex-none flex justify-center items-center gap-2 px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-xl transition-all shadow-sm whitespace-nowrap"
                >
                  <Printer className="w-5 h-5" />
                  Cetak Sekarang
                </button>
              </div>
            </div>

            {/* Print Content Area */}
            <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-200 print:shadow-none print:border-none print:p-0">
              <div className="text-center mb-10 border-b border-slate-200 pb-8">
                <h1 className="text-3xl font-bold mb-2">Katalog QR Code Unit Rantang</h1>
                <p className="text-slate-500">Total {rantangs.length} Unit Terdaftar</p>
              </div>
              
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6 md:gap-8 print:flex print:flex-wrap print:gap-4">
                {rantangs.map((rantang) => (
                  <div key={rantang.id} className="flex flex-col items-center justify-center p-6 border-2 border-dashed border-slate-200 rounded-2xl print:border-solid print:w-[150px]" style={{ pageBreakInside: 'avoid', breakInside: 'avoid' }}>
                    <img 
                      src={`https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${rantang.id}`} 
                      alt={`QR ${rantang.id}`}
                      className="w-24 h-24 sm:w-32 sm:h-32 mb-4"
                    />
                    <h3 className="font-bold text-slate-900 text-xs sm:text-sm text-center break-all">{rantang.id}</h3>
                  </div>
                ))}
              </div>
              {rantangs.length === 0 && (
                <div className="text-center py-12 text-slate-400">
                  <QrCode className="w-16 h-16 mx-auto mb-4 opacity-20" />
                  <p>Belum ada rantang terdaftar.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function NavItem({ active, onClick, icon, label }: { active: boolean, onClick: () => void, icon: React.ReactNode, label: string }) {
  return (
    <button 
      onClick={onClick}
      className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all font-medium ${
        active 
          ? 'bg-emerald-50 text-emerald-700 shadow-sm' 
          : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function MobileNavItem({ active, onClick, icon, label }: { active: boolean, onClick: () => void, icon: React.ReactNode, label: string }) {
  return (
    <button 
      onClick={onClick}
      className={`flex flex-col items-center gap-1 transition-colors ${
        active ? 'text-emerald-600' : 'text-slate-400'
      }`}
    >
      {icon}
      <span className="text-[10px] font-bold uppercase tracking-wider">{label}</span>
    </button>
  );
}
