import { useState, useEffect, useMemo, useCallback } from 'react';
import { auth, db, logOut, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, query, where, onSnapshot, orderBy, deleteDoc, doc, getDoc, setDoc } from 'firebase/firestore';
import { Job, Transaction } from '../types';
import { googleSheetsService } from '../lib/googleSheets';
import { format, addDays, parse, isAfter, isSameDay, isBefore, startOfDay } from 'date-fns';
import { CalendarDays, BarChart3, LogOut, Plus, Calendar, TrendingUp, Edit2, IndianRupee, ArrowUpRight, ArrowDownLeft, Wallet, ArrowLeft, Bell, Info, ArrowRight, CheckCircle2, Clock, MapPin, XCircle, AlertCircle, Share2, ExternalLink, Settings } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import CalendarView from './CalendarView';
import DailyJobs from './DailyJobs';
import EarningsReport from './EarningsReport';
import JobModal from './JobModal';
import TransactionHistory from './TransactionHistory';
import VoiceAssistant from './VoiceAssistant';

export default function Dashboard() {
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [activeTab, setActiveTab] = useState<'calendar' | 'earnings' | 'transactions'>('calendar');
  const [viewMode, setViewMode] = useState<'home' | 'day'>('home');
  const [jobs, setJobs] = useState<Job[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingJob, setEditingJob] = useState<Job | null>(null);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [spreadsheetId, setSpreadsheetId] = useState<string | null>(null);
  const [isConnectingSheet, setIsConnectingSheet] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [lastSynced, setLastSynced] = useState<Date | null>(null);
  const [isScriptConfigured, setIsScriptConfigured] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [hasInitialSyncRun, setHasInitialSyncRun] = useState(false);
  // Keep track of the last synced spreadsheet ID to trigger full sync on change
  const [lastSyncedSpreadsheetId, setLastSyncedSpreadsheetId] = useState<string | null>(null);

  const handleSyncAll = useCallback(async () => {
    if (!spreadsheetId) return;
    setIsSyncing(true);
    setSyncError(null);
    try {
      const result = await googleSheetsService.syncAllData(spreadsheetId, jobs, transactions);
      if (result.success) {
        setLastSynced(new Date());
      } else {
        setSyncError(result.error || 'Failed to sync all data');
      }
    } catch (error) {
      setSyncError('Sync failed');
    } finally {
      setIsSyncing(false);
    }
  }, [spreadsheetId, jobs, transactions]);

  const handleConnectSheet = useCallback(async () => {
    if (!auth.currentUser || !auth.currentUser.email) return;
    setIsConnectingSheet(true);
    try {
      const userName = auth.currentUser.displayName || auth.currentUser.email.split('@')[0] || 'User';
      let result;
      try {
        result = await googleSheetsService.initializeUserSheet(auth.currentUser.email, auth.currentUser.uid, userName);
      } catch (err) {
        console.warn('Initial connection failed, possibly due to a deleted sheet. Retrying with forceNew...', err);
        // If it fails (e.g., because the old sheet was deleted and Apps Script throws an error),
        // we retry with forceNew = true to bypass the old saved ID in Apps Script.
        result = await googleSheetsService.initializeUserSheet(auth.currentUser.email, auth.currentUser.uid, userName, true);
      }

      if (result && result.spreadsheetId) {
        await googleSheetsService.saveUserSheetConfig(auth.currentUser.uid, {
          spreadsheetId: result.spreadsheetId,
          spreadsheetUrl: result.spreadsheetUrl
        });
        setSpreadsheetId(result.spreadsheetId);
        setLastSynced(new Date());
      }
    } catch (error) {
      console.error('Failed to connect Google Sheet:', error);
    } finally {
      setIsConnectingSheet(false);
    }
  }, []);

  useEffect(() => {
    if (!auth.currentUser) return;

    // Check if script URL is configured
    setIsScriptConfigured(!!import.meta.env.VITE_GOOGLE_APPS_SCRIPT_URL);

    // Listen to User Config (Spreadsheet ID)
    const userRef = doc(db, 'users', auth.currentUser.uid);
    const unsubscribeUser = onSnapshot(userRef, (docSnap) => {
      if (docSnap.exists()) {
        const config = docSnap.data().googleSheetsConfig;
        if (config && config.spreadsheetId) {
          setSpreadsheetId(config.spreadsheetId);
          // Set an initial sync time to show it's active if not already set
          setLastSynced(prev => prev || new Date());
        } else {
          setSpreadsheetId(null);
          // AUTO-CONNECT: If no spreadsheetId and script is configured, try to connect automatically
          if (!!import.meta.env.VITE_GOOGLE_APPS_SCRIPT_URL && !isConnectingSheet) {
            handleConnectSheet();
          }
        }
      } else {
        // New user or no config document yet
        setSpreadsheetId(null);
        if (!!import.meta.env.VITE_GOOGLE_APPS_SCRIPT_URL && !isConnectingSheet) {
          handleConnectSheet();
        }
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'users/' + auth.currentUser?.uid);
    });

    // Fetch Jobs
    const qJobs = query(
      collection(db, 'jobs'),
      where('userId', '==', auth.currentUser.uid),
      orderBy('date', 'desc'),
      orderBy('createdAt', 'desc')
    );

    const unsubscribeJobs = onSnapshot(qJobs, (snapshot) => {
      const jobsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Job[];
      setJobs(jobsData);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'jobs');
    });

    // Fetch Transactions
    const qTrans = query(
      collection(db, 'transactions'),
      where('userId', '==', auth.currentUser.uid),
      orderBy('date', 'desc'),
      orderBy('createdAt', 'desc')
    );

    const unsubscribeTrans = onSnapshot(qTrans, (snapshot) => {
      const transData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Transaction[];
      setTransactions(transData);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'transactions');
    });

    return () => {
      unsubscribeUser();
      unsubscribeJobs();
      unsubscribeTrans();
    };
  }, [handleConnectSheet]);

  // Auto-sync once data is loaded and spreadsheet is connected, or if spreadsheet changes
  useEffect(() => {
    if (spreadsheetId && !isSyncing) {
      // We sync even if jobs.length is 0 to ensure the sheet is initialized correctly
      if (!hasInitialSyncRun || spreadsheetId !== lastSyncedSpreadsheetId) {
        handleSyncAll();
        setHasInitialSyncRun(true);
        setLastSyncedSpreadsheetId(spreadsheetId);
      }
    }
  }, [spreadsheetId, jobs, transactions, hasInitialSyncRun, lastSyncedSpreadsheetId, isSyncing, handleSyncAll]);

  const handleAddItem = () => {
    setEditingJob(null);
    setEditingTransaction(null);
    setIsModalOpen(true);
  };

  const handleEditJob = (job: Job) => {
    setEditingJob(job);
    setEditingTransaction(null);
    setIsModalOpen(true);
  };

  const handleEditTransaction = (trans: Transaction) => {
    setEditingTransaction(trans);
    setEditingJob(null);
    setIsModalOpen(true);
  };

  const handleSelectDate = (date: Date) => {
    setSelectedDate(date);
    setViewMode('day');
  };

  const handleCalendarSelect = (date: Date, hasItems: boolean) => {
    setSelectedDate(date);
    if (hasItems) {
      setViewMode('day');
    } else {
      handleAddItem();
    }
  };

  const handleNavigateToDate = (date: Date) => {
    setSelectedDate(date);
    setActiveTab('calendar');
    setViewMode('day');
  };

  const handleDeleteJob = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'jobs', id));
      if (spreadsheetId) {
        setIsSyncing(true);
        setSyncError(null);
        const result = await googleSheetsService.syncData(spreadsheetId, {
          type: 'job',
          action: 'delete',
          data: { id }
        });
        if (result.success) setLastSynced(new Date());
        if (!result.success) setSyncError(result.error || 'Failed to sync delete');
        setIsSyncing(false);
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `jobs/${id}`);
      setIsSyncing(false);
    }
  };

  const handleDeleteTransaction = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'transactions', id));
      if (spreadsheetId) {
        setIsSyncing(true);
        setSyncError(null);
        const result = await googleSheetsService.syncData(spreadsheetId, {
          type: 'transaction',
          action: 'delete',
          data: { id }
        });
        if (result.success) setLastSynced(new Date());
        if (!result.success) setSyncError(result.error || 'Failed to sync delete');
        setIsSyncing(false);
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `transactions/${id}`);
      setIsSyncing(false);
    }
  };

  const handleViewTransactions = () => {
    setActiveTab('transactions');
    setViewMode('home');
  };

  const handleDisconnectSheet = async () => {
    if (!auth.currentUser) return;
    // We use a simple confirm-like state or just direct disconnect since it's an iframe
    // To be safe, we'll just disconnect directly. The user can always reconnect.
    try {
      await googleSheetsService.disconnectUserSheet(auth.currentUser.uid);
      setSpreadsheetId(null);
      setLastSynced(null);
      setSyncError(null);
    } catch (error) {
      console.error('Failed to disconnect:', error);
    }
  };

  const selectedDateString = format(selectedDate, 'yyyy-MM-dd');
  const dailyJobs = jobs.filter(job => job.date === selectedDateString);
  const dailyTransactions = transactions.filter(t => t.date === selectedDateString);

  // Calculate Balance
  const totalJobEarnings = jobs.reduce((sum, j) => sum + (j.hasEarning ? j.earningAmount : 0), 0);
  const totalIncome = transactions.reduce((sum, t) => sum + (t.type === 'income' ? t.amount : 0), 0);
  const totalExpense = transactions.reduce((sum, t) => sum + (t.type === 'expense' ? t.amount : 0), 0);
  const actualBalance = totalJobEarnings + totalIncome - totalExpense;

  const isExpired = (job: Job) => {
    if (job.isCompleted) return false;
    const now = new Date();
    const jobDate = parse(job.date, 'yyyy-MM-dd', new Date());
    if (isBefore(jobDate, startOfDay(now))) return true;
    if (format(jobDate, 'yyyy-MM-dd') === format(now, 'yyyy-MM-dd')) {
      if (!job.startTime) return false;
      const [h, m] = job.startTime.split(':').map(Number);
      const jobTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m);
      return isBefore(jobTime, now);
    }
    return false;
  };

  // Find all upcoming items chronologically
  const nextScheduledItems = useMemo(() => {
    const now = new Date();
    const sortedUpcoming = [...jobs]
      .filter(job => {
        const jobDate = parse(job.date, 'yyyy-MM-dd', new Date());
        if (isAfter(jobDate, now)) return true;
        if (format(jobDate, 'yyyy-MM-dd') === format(now, 'yyyy-MM-dd')) {
          if (!job.startTime) return !job.isCompleted;
          const [h, m] = job.startTime.split(':').map(Number);
          const jobTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m);
          return isAfter(jobTime, now) && !job.isCompleted;
        }
        return false;
      })
      .sort((a, b) => {
        if (a.date !== b.date) return a.date.localeCompare(b.date);
        return (a.startTime || '00:00').localeCompare(b.startTime || '00:00');
      });

    if (sortedUpcoming.length === 0) return [];

    // Only show items for the first date in the list
    const firstDate = sortedUpcoming[0].date;
    return sortedUpcoming.filter(item => item.date === firstDate);
  }, [jobs]);

  // Find recent 10 jobs (completed or expired)
  const recentJobs = useMemo(() => {
    const sorted = [...jobs]
      .filter(job => job.isCompleted || isExpired(job))
      .sort((a, b) => {
        if (a.date !== b.date) return b.date.localeCompare(a.date);
        return (b.startTime || '00:00').localeCompare(a.startTime || '00:00');
      })
      .slice(0, 10);

    // Group by date
    const groups: { date: string, items: Job[] }[] = [];
    sorted.forEach(job => {
      const existing = groups.find(g => g.date === job.date);
      if (existing) {
        existing.items.push(job);
      } else {
        groups.push({ date: job.date, items: [job] });
      }
    });
    return groups;
  }, [jobs]);

  // Find upcoming reminders (reminders only) in next 7 days
  const upcomingReminders = useMemo(() => {
    const now = new Date();
    const sevenDaysLater = addDays(now, 7);
    return jobs.filter(job => {
      const jobDate = parse(job.date, 'yyyy-MM-dd', new Date());
      return job.category === 'reminder' && 
             (isAfter(jobDate, now) || isSameDay(jobDate, now)) &&
             !isAfter(jobDate, sevenDaysLater) &&
             !job.isCompleted;
    }).sort((a, b) => a.date.localeCompare(b.date));
  }, [jobs]);

  const [reminderIndex, setReminderIndex] = useState(0);
  useEffect(() => {
    if (upcomingReminders.length <= 1) return;
    const interval = setInterval(() => {
      setReminderIndex(prev => (prev + 1) % upcomingReminders.length);
    }, 5000);
    return () => clearInterval(interval);
  }, [upcomingReminders]);

  return (
    <div className="min-h-screen bg-stone-50 font-sans text-stone-900 flex flex-col">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-md border-b border-stone-200 sticky top-0 z-30">
        <div className="max-w-5xl mx-auto px-2 sm:px-4 h-16 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <div className="bg-orange-600 p-1.5 rounded-lg shadow-lg shadow-orange-200 shrink-0">
              <CalendarDays className="w-5 h-5 text-white" />
            </div>
            <h1 className="text-lg sm:text-xl font-bold text-stone-800 tracking-tight truncate max-w-[100px] sm:max-w-none">Papa's Tracker</h1>
          </div>
          <div className="flex items-center gap-1 sm:gap-2">
            {!isScriptConfigured && (
              <div className="flex items-center gap-1 text-red-500 bg-red-50 px-2 py-1 rounded-lg border border-red-100" title="Missing VITE_GOOGLE_APPS_SCRIPT_URL">
                <AlertCircle size={14} className="shrink-0" />
                <span className="hidden sm:inline text-[10px] font-bold uppercase tracking-tighter">Setup Required</span>
              </div>
            )}
            {spreadsheetId ? (
              <div className="flex flex-col items-end">
                <div className="flex items-center gap-1">
                  <button
                    onClick={handleDisconnectSheet}
                    className="flex items-center gap-1.5 text-red-500 hover:bg-red-50 transition-all p-2 rounded-xl"
                    title="Disconnect Sheet"
                  >
                    <XCircle className="w-5 h-5 shrink-0" />
                  </button>
                  <button
                    onClick={handleSyncAll}
                    disabled={isSyncing}
                    className="flex items-center gap-1.5 text-blue-600 hover:bg-blue-50 transition-all p-2 rounded-xl disabled:opacity-50"
                    title="Force Sync All Data"
                  >
                    <Share2 className={`w-5 h-5 shrink-0 ${isSyncing ? 'animate-spin' : ''}`} />
                    <span className="hidden sm:inline text-sm font-bold">Sync</span>
                  </button>
                  <a
                    href={`https://docs.google.com/spreadsheets/d/${spreadsheetId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-green-600 hover:bg-green-50 transition-all p-2 rounded-xl"
                    title="Open Google Sheet"
                  >
                    <ExternalLink className="w-5 h-5 shrink-0" />
                    <span className="hidden sm:inline text-sm font-bold">Sheet</span>
                  </a>
                </div>
                <div className="flex items-center gap-1">
                  {syncError && (
                    <button onClick={handleSyncAll} className="text-[8px] sm:text-[9px] font-bold uppercase tracking-widest px-1.5 sm:px-2 text-red-500 bg-red-50 rounded-full truncate max-w-[80px] sm:max-w-none hover:bg-red-100 cursor-pointer" title={`${syncError} - Click to retry`}>
                      Error (Retry)
                    </button>
                  )}
                  {lastSynced && !syncError && (
                    <span className={`text-[8px] sm:text-[9px] font-bold uppercase tracking-widest px-1.5 sm:px-2 transition-all duration-500 ${isSyncing ? 'text-orange-500 animate-pulse' : 'text-stone-400'}`}>
                      {isSyncing ? 'Syncing...' : <span className="hidden sm:inline">{`Synced: ${format(lastSynced, 'hh:mm:ss a')}`}</span>}
                      {!isSyncing && <span className="sm:hidden">{format(lastSynced, 'HH:mm')}</span>}
                    </span>
                  )}
                </div>
              </div>
            ) : (
              <button
                onClick={() => {
                  if (!isScriptConfigured) {
                    alert("Please add your VITE_GOOGLE_APPS_SCRIPT_URL in the AI Studio Secrets panel first!");
                    return;
                  }
                  handleConnectSheet();
                }}
                disabled={isConnectingSheet}
                className="flex items-center gap-1.5 text-orange-600 hover:bg-orange-50 transition-all p-2 rounded-xl disabled:opacity-50"
                title="Connect to Google Sheets"
              >
                <Share2 className={`w-5 h-5 shrink-0 ${isConnectingSheet ? 'animate-spin' : ''}`} />
                <span className="hidden sm:inline text-sm font-bold">{isConnectingSheet ? 'Connecting...' : 'Connect Sheet'}</span>
              </button>
            )}
            <button 
              onClick={logOut}
              className="flex items-center gap-1.5 text-stone-500 hover:text-red-600 transition-all p-2 rounded-xl hover:bg-red-50"
              title="Sign out"
            >
              <LogOut className="w-5 h-5 shrink-0" />
              <span className="hidden sm:inline text-sm font-bold">Sign out</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-5xl mx-auto w-full px-4 py-4 pb-32">
        {activeTab === 'calendar' ? (
          viewMode === 'home' ? (
            <div className="space-y-6 pb-24">
              {/* Slim Upcoming Reminder Ticker */}
              <AnimatePresence mode="wait">
                {upcomingReminders.length > 0 && (
                  <motion.div
                    key={upcomingReminders[reminderIndex].id}
                    initial={{ opacity: 0, y: -5 }}
                    animate={{ 
                      opacity: 1, 
                      y: 0,
                      x: [0, -2, 2, -2, 2, 0]
                    }}
                    transition={{
                      x: {
                        duration: 0.4,
                        repeat: Infinity,
                        repeatDelay: 4
                      },
                      opacity: { duration: 0.2 },
                      y: { duration: 0.2 }
                    }}
                    exit={{ opacity: 0, y: 5 }}
                    className="flex justify-center -mt-2 mb-2"
                  >
                    <div className="flex items-center gap-2 text-[10px] sm:text-[11px] font-bold bg-white text-stone-900 py-0.5 px-4 rounded-full border border-black shadow-sm backdrop-blur-sm">
                      <Bell size={10} className="text-red-600 shrink-0" />
                      <span className="truncate max-w-[150px] sm:max-w-[300px] uppercase tracking-tight">{upcomingReminders[reminderIndex].title}</span>
                      <span className="w-1 h-1 rounded-full bg-red-600/30 mx-1"></span>
                      <span className="text-red-600 font-black">
                        {format(parse(upcomingReminders[reminderIndex].date, 'yyyy-MM-dd', new Date()), 'MMM dd')}
                        {upcomingReminders[reminderIndex].startTime ? ` @ ${upcomingReminders[reminderIndex].startTime}` : ''}
                      </span>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Calendar Section */}
              <div className="bg-white rounded-[2.5rem] shadow-xl shadow-stone-200/50 p-6 border border-stone-100">
                <CalendarView 
                  selectedDate={selectedDate} 
                  onSelectDate={handleCalendarSelect} 
                  jobs={jobs}
                  transactions={transactions}
                />
              </div>

              {/* Next Schedule Section */}
              <div className="space-y-8">
                <div className="flex items-center justify-between px-2">
                  <h2 className="text-4xl font-serif italic tracking-tighter">Next Schedule</h2>
                  <div className="h-[1px] flex-1 bg-black/10 mx-8" />
                  <span className="text-[10px] uppercase tracking-[0.3em] text-black/30 font-black">Chronological</span>
                </div>

                {nextScheduledItems.length > 0 ? (
                  <div className="space-y-6">
                    {nextScheduledItems.map((item) => (
                      <motion.div
                        key={item.id}
                        whileHover={{ x: 8 }}
                        onClick={() => handleEditJob(item)}
                        className="group cursor-pointer bg-white border border-black/5 p-5 sm:p-8 rounded-[2rem] shadow-sm hover:shadow-xl transition-all duration-500"
                      >
                        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 mb-2 sm:mb-3">
                              <span className={`text-[8px] sm:text-[10px] px-2.5 py-0.5 sm:px-3 sm:py-1 rounded-full uppercase tracking-widest font-black ${
                                item.category === 'reminder' ? 'bg-orange-100 text-orange-700' :
                                item.category === 'program' ? 'bg-blue-100 text-blue-700' :
                                'bg-green-100 text-green-700'
                              }`}>
                                {item.category}
                              </span>
                              <span className="text-[9px] sm:text-xs font-mono text-black/30 font-bold uppercase tracking-wider">
                                {format(parse(item.date, 'yyyy-MM-dd', new Date()), 'EEEE, MMM dd')}
                              </span>
                            </div>
                            <h3 className="text-lg sm:text-2xl font-bold mb-2 sm:mb-4 group-hover:text-orange-600 transition-colors tracking-tight leading-[1.1] break-words whitespace-pre-wrap">{item.title}</h3>
                            {item.location && (
                              <div className="flex items-center gap-1.5 text-[10px] sm:text-xs text-black/40 font-medium">
                                <MapPin size={10} className="text-orange-500 shrink-0 sm:w-3 sm:h-3" />
                                <span className="truncate">{item.location}</span>
                              </div>
                            )}
                          </div>
                          <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-start gap-2 shrink-0 border-t sm:border-t-0 border-black/5 pt-3 sm:pt-0">
                            <div className="flex items-center gap-2 sm:gap-3">
                              <Clock size={14} className="text-black/20 sm:w-5 sm:h-5" />
                              <span className="text-lg sm:text-2xl font-mono font-black tracking-tighter">
                                {item.startTime ? format(parse(item.startTime, 'HH:mm', new Date()), 'hh:mm a') : '--:--'}
                              </span>
                            </div>
                            {item.hasEarning && (
                              <div className="text-right">
                                <p className="text-sm sm:text-lg font-mono font-black text-green-600">₹{item.earningAmount.toLocaleString()}</p>
                              </div>
                            )}
                          </div>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                ) : (
                  <div className="bg-black/5 rounded-[2.5rem] p-16 text-center border-2 border-dashed border-black/5">
                    <p className="text-black/30 italic font-serif text-xl">No upcoming items scheduled.</p>
                  </div>
                )}
              </div>

              {/* Recent 10 Jobs Section */}
              <div className="space-y-8">
                <div className="flex items-center justify-between px-2">
                  <h2 className="text-4xl font-serif italic tracking-tighter">Recent 10 Jobs</h2>
                  <div className="h-[1px] flex-1 bg-black/10 mx-8" />
                  <span className="text-[10px] uppercase tracking-[0.3em] text-black/30 font-black">History</span>
                </div>

                <div className="space-y-12">
                  {recentJobs.map((group) => (
                    <div key={group.date} className="space-y-6">
                      <h3 className="text-[11px] uppercase tracking-[0.4em] text-black/20 font-black flex items-center gap-4 px-2">
                        {format(parse(group.date, 'yyyy-MM-dd', new Date()), 'MMMM dd, yyyy')}
                        <div className="h-[1px] flex-1 bg-black/5" />
                      </h3>
                      <div className="space-y-3">
                        {group.items.map((job) => {
                          const expired = isExpired(job);
                          const isDone = job.isCompleted || expired;
                          return (
                            <motion.div
                              key={job.id}
                              whileHover={{ scale: 1.01 }}
                              className={`flex items-center justify-between p-3 sm:p-4 rounded-2xl border transition-all duration-300 ${
                                isDone 
                                  ? 'bg-green-50/20 border-green-100 shadow-sm shadow-green-100/50' 
                                  : 'bg-white border-black/5 shadow-sm'
                              }`}
                            >
                              <div className="flex items-center gap-3 sm:gap-5 flex-1 min-w-0">
                                <div className={`w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center shrink-0 ${
                                  isDone ? 'bg-green-100 text-green-600' :
                                  'bg-black/5 text-black/30'
                                }`}>
                                  {isDone ? <CheckCircle2 size={16} className="sm:w-5 sm:h-5" /> :
                                   <Clock size={16} className="sm:w-5 sm:h-5" />}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2">
                                    <h4 className={`text-sm sm:text-base font-bold tracking-tight leading-[1.2] break-words whitespace-pre-wrap ${isDone ? 'text-green-900/60 line-through' : 'text-black'}`}>
                                      {job.title}
                                    </h4>
                                  </div>
                                  <p className="text-[8px] sm:text-[10px] text-black/40 font-mono uppercase font-bold tracking-wider mt-0.5">
                                    {job.startTime ? format(parse(job.startTime, 'HH:mm', new Date()), 'hh:mm a') : 'No Time'} • {job.category}
                                  </p>
                                </div>
                              </div>

                              <div className="flex items-center gap-3 sm:gap-8 shrink-0 ml-3">
                                {job.hasEarning && (
                                  <div className="text-right">
                                    <p className={`text-sm sm:text-lg font-mono font-black tracking-tighter ${isDone ? 'text-green-700' : 'text-black'}`}>
                                      ₹{job.earningAmount.toLocaleString()}
                                    </p>
                                    <p className="text-[7px] sm:text-[9px] text-black/30 uppercase tracking-widest font-bold">Earnings</p>
                                  </div>
                                )}
                                <button
                                  onClick={() => handleEditJob(job)}
                                  className="p-1.5 sm:p-2.5 hover:bg-black/5 rounded-full transition-all text-black/30 hover:text-green-600"
                                  title="Edit Job"
                                >
                                  <Edit2 size={14} className="sm:w-[18px] sm:h-[18px]" />
                                </button>
                              </div>
                            </motion.div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                  {recentJobs.length === 0 && (
                    <div className="text-center py-20 border-2 border-dashed border-black/5 rounded-[2.5rem]">
                      <p className="text-black/20 italic font-serif text-xl">No recent jobs found.</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="flex items-center gap-4">
                <button
                  onClick={() => setViewMode('home')}
                  className="bg-white p-3 rounded-2xl shadow-sm border border-stone-200 text-stone-600 hover:text-orange-600 transition-all active:scale-95"
                  title="Back to Home"
                >
                  <ArrowLeft className="w-6 h-6" />
                </button>
              </div>
              <DailyJobs 
                date={selectedDate} 
                jobs={dailyJobs} 
                transactions={dailyTransactions}
                onAddJob={handleAddItem}
                onEditJob={handleEditJob}
                onEditTransaction={handleEditTransaction}
                onDeleteJob={handleDeleteJob}
                onDeleteTransaction={handleDeleteTransaction}
              />
            </div>
          )
        ) : activeTab === 'earnings' ? (
          <div className="bg-white rounded-[2rem] shadow-xl shadow-stone-200/50 p-4 sm:p-8 border border-stone-100">
            <EarningsReport 
              jobs={jobs} 
              onNavigateToDate={handleNavigateToDate}
              onDeleteJob={handleDeleteJob}
            />
          </div>
        ) : (
          <div className="bg-white rounded-[2rem] shadow-xl shadow-stone-200/50 p-4 sm:p-8 border border-stone-100">
            <TransactionHistory 
              transactions={transactions} 
              onEditTransaction={handleEditTransaction}
              onDeleteTransaction={handleDeleteTransaction}
              onBack={() => setActiveTab('calendar')}
            />
          </div>
        )}
      </main>

      {/* Unified Bottom Navigation */}
      <div className="fixed bottom-0 left-0 right-0 p-4 sm:p-6 pointer-events-none z-40">
        <div className="max-w-md mx-auto flex items-center justify-between gap-4 pointer-events-auto">
          {/* Tab Switcher */}
          <div className="flex-1 bg-stone-900/95 backdrop-blur-xl p-1.5 rounded-2xl shadow-2xl flex items-center gap-1 border border-white/10">
            <button
              onClick={() => {
                setActiveTab('calendar');
                setViewMode('home');
              }}
              className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl transition-all ${
                activeTab === 'calendar' ? 'bg-orange-600 text-white shadow-lg' : 'text-stone-400 hover:text-white'
              }`}
            >
              <CalendarDays className="w-5 h-5" />
              <span className="hidden sm:inline text-[10px] font-bold uppercase tracking-wider">Home</span>
            </button>
            <button
              onClick={() => {
                setActiveTab('earnings');
                setViewMode('home');
              }}
              className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl transition-all ${
                activeTab === 'earnings' ? 'bg-orange-600 text-white shadow-lg' : 'text-stone-400 hover:text-white'
              }`}
            >
              <BarChart3 className="w-5 h-5" />
              <span className="hidden sm:inline text-[10px] font-bold uppercase tracking-wider">Jobs</span>
            </button>
            <button
              onClick={() => {
                setActiveTab('transactions');
                setViewMode('home');
              }}
              className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl transition-all ${
                activeTab === 'transactions' ? 'bg-orange-600 text-white shadow-lg' : 'text-stone-400 hover:text-white'
              }`}
            >
              <Wallet className="w-5 h-5" />
              <span className="hidden sm:inline text-[10px] font-bold uppercase tracking-wider">Trans</span>
            </button>
          </div>

          {/* Add Button */}
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={handleAddItem}
            className="w-14 h-14 sm:w-16 sm:h-16 bg-orange-600 text-white rounded-2xl shadow-2xl shadow-orange-600/40 flex items-center justify-center border-2 border-orange-400/30 flex-shrink-0"
          >
            <Plus className="w-8 h-8 sm:w-10 sm:h-10" />
          </motion.button>
        </div>
      </div>

      {/* Job Modal */}
      {isModalOpen && (
        <JobModal 
          isOpen={isModalOpen} 
          onClose={() => setIsModalOpen(false)} 
          selectedDate={selectedDate}
          jobToEdit={editingJob}
          transactionToEdit={editingTransaction}
          spreadsheetId={spreadsheetId}
          onSyncSuccess={() => setLastSynced(new Date())}
          onSyncStart={() => setIsSyncing(true)}
          onSyncEnd={() => setIsSyncing(false)}
        />
      )}

      {/* Voice Assistant */}
      <VoiceAssistant jobs={jobs} transactions={transactions} />
    </div>
  );
}