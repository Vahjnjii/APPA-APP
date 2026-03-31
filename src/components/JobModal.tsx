import React, { useState, useEffect } from 'react';
import { Job, NewJob, JobCategory, JobPriority, Transaction, TransactionType, NewTransaction } from '../types';
import { format, parse } from 'date-fns';
import { X, Save, IndianRupee, Clock, Calendar, FileText, Briefcase, Star, PartyPopper, Users, CheckCircle2, AlertCircle, ArrowRight, ArrowLeft, MapPin, ArrowUpRight, ArrowDownLeft, Bell } from 'lucide-react';
import { auth, db, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, addDoc, updateDoc, doc, serverTimestamp } from 'firebase/firestore';
import { googleSheetsService } from '../lib/googleSheets';
import { motion, AnimatePresence } from 'motion/react';

interface JobModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedDate: Date;
  jobToEdit?: Job | null;
  transactionToEdit?: Transaction | null;
  spreadsheetId?: string | null;
  onSyncSuccess?: () => void;
  onSyncStart?: () => void;
  onSyncEnd?: () => void;
}

type Step = 'input' | 'confirm' | 'success';
type ModalMode = 'task' | 'transaction';

export default function JobModal({ 
  isOpen, 
  onClose, 
  selectedDate, 
  jobToEdit, 
  transactionToEdit, 
  spreadsheetId = null,
  onSyncSuccess,
  onSyncStart,
  onSyncEnd
}: JobModalProps) {
  const [mode, setMode] = useState<ModalMode>(transactionToEdit ? 'transaction' : 'task');
  const [step, setStep] = useState<Step>('input');
  
  // Task fields
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState(format(selectedDate, 'yyyy-MM-dd'));
  const [startTime, setStartTime] = useState('');
  const [timeHour, setTimeHour] = useState('12');
  const [timeMinute, setTimeMinute] = useState('00');
  const [timePeriod, setTimePeriod] = useState('AM');
  const [category, setCategory] = useState<JobCategory>('job');
  const [location, setLocation] = useState('');
  const [hasEarning, setHasEarning] = useState(false);
  const [earningAmount, setEarningAmount] = useState('');
  const [isCompleted, setIsCompleted] = useState(false);
  
  // Transaction fields
  const [transTitle, setTransTitle] = useState('');
  const [transAmount, setTransAmount] = useState('');
  const [transType, setTransType] = useState<TransactionType>('income');
  const [transDescription, setTransDescription] = useState('');
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);

  useEffect(() => {
    setValidationError(null);
    setError(null);
    setSyncError(null);
    if (jobToEdit) {
      setMode('task');
      setTitle(jobToEdit.title);
      setDescription(jobToEdit.description || '');
      setDate(jobToEdit.date);
      
      if (jobToEdit.startTime) {
        const [h, m] = jobToEdit.startTime.split(':');
        const hours = parseInt(h);
        const period = hours >= 12 ? 'PM' : 'AM';
        const h12 = hours % 12 || 12;
        setTimeHour(h12.toString().padStart(2, '0'));
        setTimeMinute(m);
        setTimePeriod(period);
        setStartTime(jobToEdit.startTime);
      } else {
        setStartTime('');
        setTimeHour('12');
        setTimeMinute('00');
        setTimePeriod('AM');
      }

      setCategory(jobToEdit.category || 'job');
      setLocation(jobToEdit.location || '');
      setHasEarning(jobToEdit.hasEarning);
      setEarningAmount(jobToEdit.earningAmount > 0 ? jobToEdit.earningAmount.toString() : '');
      setIsCompleted(jobToEdit.isCompleted || false);
    } else if (transactionToEdit) {
      setMode('transaction');
      setTransTitle(transactionToEdit.title);
      setTransAmount(transactionToEdit.amount.toString());
      setTransType(transactionToEdit.type);
      setTransDescription(transactionToEdit.description || '');
      setDate(transactionToEdit.date);
    } else {
      setMode('task');
      setTitle('');
      setDescription('');
      setDate(format(selectedDate, 'yyyy-MM-dd'));
      setStartTime('');
      setTimeHour('12');
      setTimeMinute('00');
      setTimePeriod('AM');
      setCategory('job');
      setLocation('');
      setHasEarning(false);
      setEarningAmount('');
      setIsCompleted(false);
      
      setTransTitle('');
      setTransAmount('');
      setTransType('income');
      setTransDescription('');
    }
    setStep('input');
  }, [jobToEdit, transactionToEdit, selectedDate, isOpen]);

  useEffect(() => {
    if (timeHour && timeMinute && timePeriod) {
      let h = parseInt(timeHour);
      if (timePeriod === 'PM' && h < 12) h += 12;
      if (timePeriod === 'AM' && h === 12) h = 0;
      setStartTime(`${h.toString().padStart(2, '0')}:${timeMinute}`);
    }
  }, [timeHour, timeMinute, timePeriod]);

  if (!isOpen) return null;

  const formatTimeDisplay = (timeStr: string) => {
    if (!timeStr) return 'Not set';
    try {
      const date = parse(timeStr, 'HH:mm', new Date());
      return format(date, 'hh:mm a');
    } catch (e) {
      return timeStr;
    }
  };

  const handleReview = (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError(null);
    if (mode === 'task') {
      if (!title.trim()) {
        setValidationError('Please enter a title for the task');
        return;
      }
    } else {
      if (!transTitle.trim()) {
        setValidationError('Please enter a description for the transaction');
        return;
      }
      if (!transAmount || parseFloat(transAmount) <= 0) {
        setValidationError('Please enter a valid amount');
        return;
      }
    }
    setStep('confirm');
  };

  const handleFinalSubmit = async () => {
    if (!auth.currentUser) return;
    setIsSubmitting(true);
    setError(null);

    try {
      if (mode === 'task') {
        const finalHasEarning = earningAmount !== '' && parseFloat(earningAmount) > 0;
        const jobData: NewJob = {
          userId: auth.currentUser.uid,
          title: title.trim(),
          description: description.trim(),
          date,
          startTime: startTime,
          category,
          location: location.trim(),
          priority: 'important',
          hasEarning: finalHasEarning,
          earningAmount: finalHasEarning ? parseFloat(earningAmount) : 0,
          isCompleted,
        };

        if (jobToEdit) {
          const jobRef = doc(db, 'jobs', jobToEdit.id);
          await updateDoc(jobRef, { ...jobData });
          if (spreadsheetId) {
            if (onSyncStart) onSyncStart();
            const result = await googleSheetsService.syncData(spreadsheetId, {
              type: 'job',
              action: 'update',
              data: { ...jobData, id: jobToEdit.id }
            });
            if (result.success && onSyncSuccess) onSyncSuccess();
            if (!result.success) setSyncError(result.error || 'Failed to sync');
            if (onSyncEnd) onSyncEnd();
          }
        } else {
          const docRef = await addDoc(collection(db, 'jobs'), {
            ...jobData,
            createdAt: serverTimestamp()
          });
          if (spreadsheetId) {
            if (onSyncStart) onSyncStart();
            const result = await googleSheetsService.syncData(spreadsheetId, {
              type: 'job',
              action: 'create',
              data: { ...jobData, id: docRef.id }
            });
            if (result.success && onSyncSuccess) onSyncSuccess();
            if (!result.success) setSyncError(result.error || 'Failed to sync');
            if (onSyncEnd) onSyncEnd();
          }
        }
      } else {
        const transData: NewTransaction = {
          userId: auth.currentUser.uid,
          title: transTitle.trim(),
          amount: parseFloat(transAmount),
          type: transType,
          date,
          description: transDescription.trim(),
        };

        if (transactionToEdit) {
          const transRef = doc(db, 'transactions', transactionToEdit.id);
          await updateDoc(transRef, { ...transData });
          if (spreadsheetId) {
            if (onSyncStart) onSyncStart();
            const result = await googleSheetsService.syncData(spreadsheetId, {
              type: 'transaction',
              action: 'update',
              data: { ...transData, id: transactionToEdit.id }
            });
            if (result.success && onSyncSuccess) onSyncSuccess();
            if (!result.success) setSyncError(result.error || 'Failed to sync');
            if (onSyncEnd) onSyncEnd();
          }
        } else {
          const docRef = await addDoc(collection(db, 'transactions'), {
            ...transData,
            createdAt: serverTimestamp()
          });
          if (spreadsheetId) {
            if (onSyncStart) onSyncStart();
            const result = await googleSheetsService.syncData(spreadsheetId, {
              type: 'transaction',
              action: 'create',
              data: { ...transData, id: docRef.id }
            });
            if (result.success && onSyncSuccess) onSyncSuccess();
            if (!result.success) setSyncError(result.error || 'Failed to sync');
            if (onSyncEnd) onSyncEnd();
          }
        }
      }
      
      setStep('success');
      setTimeout(() => {
        onClose();
      }, 2000);
    } catch (error: any) {
      const op = (jobToEdit || transactionToEdit) ? OperationType.UPDATE : OperationType.CREATE;
      const path = mode === 'task' ? 'jobs' : 'transactions';
      setError(error.message || 'Failed to save data. Please try again.');
      try {
        handleFirestoreError(error, op, path);
      } catch (e) {
        // Error already logged by handleFirestoreError
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderInputStep = () => (
    <form id="job-form" onSubmit={handleReview} className="space-y-6">
      {/* Mode Switcher */}
      {validationError && (
        <div className="bg-red-50 text-red-600 p-3 rounded-xl border border-red-200 text-sm font-medium flex items-start gap-2 animate-in fade-in slide-in-from-top-2">
          <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <p>{validationError}</p>
        </div>
      )}
      {error && (
        <div className="bg-red-50 text-red-600 p-3 rounded-xl border border-red-200 text-sm font-medium flex items-start gap-2 animate-in fade-in slide-in-from-top-2">
          <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <p>{error}</p>
        </div>
      )}
      {syncError && (
        <div className="bg-red-50 text-red-600 p-3 rounded-xl border border-red-200 text-sm font-medium flex items-start gap-2">
          <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <p>Google Sheets Sync Error: {syncError}</p>
        </div>
      )}
      {!jobToEdit && !transactionToEdit && (
        <div className="flex bg-stone-100 p-1 rounded-2xl mb-2">
          <button
            type="button"
            onClick={() => setMode('task')}
            className={`flex-1 py-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 ${mode === 'task' ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-500'}`}
          >
            <Briefcase className="w-4 h-4" /> Task
          </button>
          <button
            type="button"
            onClick={() => setMode('transaction')}
            className={`flex-1 py-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 ${mode === 'transaction' ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-500'}`}
          >
            <IndianRupee className="w-4 h-4" /> Transaction
          </button>
        </div>
      )}

      {mode === 'task' ? (
        <>
          {/* Title */}
          <div>
            <label className="block text-[10px] font-bold text-stone-400 mb-1.5 uppercase tracking-widest">What's the task?</label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full text-lg sm:text-xl p-3.5 bg-stone-50 border-2 border-stone-100 rounded-2xl focus:border-orange-500 focus:bg-white transition-all outline-none font-bold"
              placeholder="e.g. Morning Walk"
            />
          </div>

          {/* Category */}
          <div>
            <label className="block text-[10px] font-bold text-stone-400 mb-1.5 uppercase tracking-widest">Type</label>
            <div className="flex bg-stone-100 p-1 rounded-xl">
              <button
                type="button"
                onClick={() => setCategory('job')}
                className={`flex-1 flex items-center justify-center gap-1 py-2 rounded-lg text-[10px] font-bold transition-all ${category === 'job' ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-500'}`}
              >
                <Briefcase className="w-3 h-3" /> Job
              </button>
              <button
                type="button"
                onClick={() => setCategory('program')}
                className={`flex-1 flex items-center justify-center gap-1 py-2 rounded-lg text-[10px] font-bold transition-all ${category === 'program' ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-500'}`}
              >
                <Users className="w-3 h-3" /> Program
              </button>
              <button
                type="button"
                onClick={() => setCategory('reminder')}
                className={`flex-1 flex items-center justify-center gap-1 py-2 rounded-lg text-[10px] font-bold transition-all ${category === 'reminder' ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-500'}`}
              >
                <Bell className="w-3 h-3" /> Reminder
              </button>
            </div>
          </div>

          {/* Location */}
          <div>
            <label className="block text-[10px] font-bold text-stone-400 mb-1.5 uppercase tracking-widest flex items-center gap-1.5">
              <MapPin className="w-3 h-3" /> Location
            </label>
            <input
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              className="w-full p-3.5 bg-stone-50 border-2 border-stone-100 rounded-2xl focus:border-orange-500 focus:bg-white transition-all outline-none font-bold text-sm"
              placeholder="e.g. Central Park"
            />
          </div>

          {/* Date and Time */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-[10px] font-bold text-stone-400 mb-1.5 uppercase tracking-widest flex items-center gap-1.5">
                <Calendar className="w-3 h-3" /> Date
              </label>
              <input
                type="date"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full p-3.5 bg-stone-50 border-2 border-stone-100 rounded-2xl focus:border-orange-500 focus:bg-white transition-all outline-none font-bold text-sm"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-stone-400 mb-1.5 uppercase tracking-widest flex items-center gap-1.5">
                <Clock className="w-3 h-3" /> Time
              </label>
              <div className="grid grid-cols-3 gap-2">
                <select
                  value={timeHour}
                  onChange={(e) => setTimeHour(e.target.value)}
                  className="w-full p-3 bg-stone-50 border-2 border-stone-100 rounded-2xl focus:border-orange-500 focus:bg-white transition-all outline-none font-bold text-sm text-center"
                >
                  {[...Array(12)].map((_, i) => {
                    const h = (i + 1).toString().padStart(2, '0');
                    return <option key={h} value={h}>{h}</option>;
                  })}
                </select>
                <select
                  value={timeMinute}
                  onChange={(e) => setTimeMinute(e.target.value)}
                  className="w-full p-3 bg-stone-50 border-2 border-stone-100 rounded-2xl focus:border-orange-500 focus:bg-white transition-all outline-none font-bold text-sm text-center"
                >
                  {[...Array(60)].map((_, i) => {
                    const m = i.toString().padStart(2, '0');
                    return <option key={m} value={m}>{m}</option>;
                  })}
                </select>
                <select
                  value={timePeriod}
                  onChange={(e) => setTimePeriod(e.target.value)}
                  className="w-full p-3 bg-stone-50 border-2 border-stone-100 rounded-2xl focus:border-orange-500 focus:bg-white transition-all outline-none font-bold text-sm text-center"
                >
                  <option value="AM">AM</option>
                  <option value="PM">PM</option>
                </select>
              </div>
            </div>
          </div>

          {/* Earnings Section */}
          <div className="bg-stone-50 p-4 rounded-2xl border-2 border-stone-100 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-green-100 text-green-600">
                  <IndianRupee className="w-5 h-5" />
                </div>
                <div>
                  <span className="font-bold text-stone-800 text-sm block">Earnings</span>
                  <span className="text-[10px] text-stone-400 uppercase font-bold">Leave empty if none</span>
                </div>
              </div>
              
              <button
                type="button"
                onClick={() => setIsCompleted(!isCompleted)}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-all border-2 ${
                  isCompleted 
                    ? 'bg-green-600 border-green-500 text-white shadow-lg shadow-green-200' 
                    : 'bg-white border-stone-200 text-stone-400 hover:border-green-500 hover:text-green-600'
                }`}
              >
                <CheckCircle2 size={16} />
                <span className="text-[10px] font-black uppercase tracking-widest">
                  {isCompleted ? 'Completed' : 'Mark Done'}
                </span>
              </button>
            </div>

            <div className="pt-1">
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <IndianRupee className="h-5 w-5 text-green-600" />
                </div>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={earningAmount}
                  onChange={(e) => setEarningAmount(e.target.value)}
                  className="w-full text-2xl pl-10 p-3 bg-white border-2 border-green-200 rounded-xl focus:border-green-500 transition-all outline-none font-bold text-green-700"
                  placeholder="0"
                />
              </div>
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-[10px] font-bold text-stone-400 mb-1.5 uppercase tracking-widest flex items-center gap-1.5">
              <FileText className="w-3 h-3" /> Notes
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="w-full p-3.5 bg-stone-50 border-2 border-stone-100 rounded-2xl focus:border-orange-500 focus:bg-white transition-all outline-none resize-none font-medium text-sm"
              placeholder="Any details..."
            />
          </div>
        </>
      ) : (
        <>
          {/* Transaction Reason */}
          <div>
            <label className="block text-[10px] font-bold text-stone-400 mb-1.5 uppercase tracking-widest">Reason for Transaction</label>
            <input
              type="text"
              required
              value={transTitle}
              onChange={(e) => setTransTitle(e.target.value)}
              className="w-full text-lg sm:text-xl p-3.5 bg-stone-50 border-2 border-stone-100 rounded-2xl focus:border-orange-500 focus:bg-white transition-all outline-none font-bold"
              placeholder="e.g. Grocery Shopping"
            />
          </div>

          {/* Transaction Type */}
          <div>
            <label className="block text-[10px] font-bold text-stone-400 mb-1.5 uppercase tracking-widest">Transaction Type</label>
            <div className="flex bg-stone-100 p-1 rounded-xl">
              <button
                type="button"
                onClick={() => setTransType('income')}
                className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-xs font-bold transition-all ${transType === 'income' ? 'bg-white text-green-600 shadow-sm' : 'text-stone-500'}`}
              >
                <ArrowDownLeft className="w-4 h-4" /> Incoming
              </button>
              <button
                type="button"
                onClick={() => setTransType('expense')}
                className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-xs font-bold transition-all ${transType === 'expense' ? 'bg-white text-red-600 shadow-sm' : 'text-stone-500'}`}
              >
                <ArrowUpRight className="w-4 h-4" /> Outgoing
              </button>
            </div>
          </div>

          {/* Amount and Date */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-[10px] font-bold text-stone-400 mb-1.5 uppercase tracking-widest flex items-center gap-1.5">
                <IndianRupee className="w-3 h-3" /> Amount
              </label>
              <input
                type="number"
                required
                min="0"
                step="1"
                value={transAmount}
                onChange={(e) => setTransAmount(e.target.value)}
                className={`w-full p-3.5 bg-stone-50 border-2 border-stone-100 rounded-2xl focus:bg-white transition-all outline-none font-bold text-lg ${transType === 'income' ? 'focus:border-green-500 text-green-700' : 'focus:border-red-500 text-red-700'}`}
                placeholder="0"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-stone-400 mb-1.5 uppercase tracking-widest flex items-center gap-1.5">
                <Calendar className="w-3 h-3" /> Date
              </label>
              <input
                type="date"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full p-3.5 bg-stone-50 border-2 border-stone-100 rounded-2xl focus:border-orange-500 focus:bg-white transition-all outline-none font-bold text-sm"
              />
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-[10px] font-bold text-stone-400 mb-1.5 uppercase tracking-widest flex items-center gap-1.5">
              <FileText className="w-3 h-3" /> Notes
            </label>
            <textarea
              value={transDescription}
              onChange={(e) => setTransDescription(e.target.value)}
              rows={3}
              className="w-full p-3.5 bg-stone-50 border-2 border-stone-100 rounded-2xl focus:border-orange-500 focus:bg-white transition-all outline-none resize-none font-medium text-sm"
              placeholder="Any details about this transaction..."
            />
          </div>
        </>
      )}
    </form>
  );

  const renderConfirmStep = () => (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
      <div className="bg-orange-50 p-4 rounded-2xl border border-orange-100 flex items-start gap-3">
        <AlertCircle className="w-5 h-5 text-orange-600 shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-bold text-orange-800">Please review the details</p>
          <p className="text-xs text-orange-600">Make sure everything is correct before saving.</p>
        </div>
      </div>

      <div className="space-y-4 bg-stone-50 p-6 rounded-3xl border border-stone-100">
        <div className="flex justify-between items-start">
          <div>
            <span className="text-[9px] font-bold text-stone-400 uppercase tracking-widest block mb-1">
              {mode === 'task' ? 'Task Name' : 'Reason'}
            </span>
            <p className="text-xl font-bold text-stone-800">{mode === 'task' ? title : transTitle}</p>
          </div>
          <div className={`px-3 py-1 rounded-full text-[9px] font-bold uppercase tracking-widest ${mode === 'task' ? 'bg-orange-100 text-orange-600' : 'bg-stone-200 text-stone-600'}`}>
            {mode}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-6 pt-4 border-t border-stone-200">
          <div>
            <span className="text-[9px] font-bold text-stone-400 uppercase tracking-widest block mb-1">Date</span>
            <div className="flex items-center gap-2 text-stone-700 font-bold">
              <Calendar className="w-4 h-4 text-orange-500" />
              {format(parse(date, 'yyyy-MM-dd', new Date()), 'MMMM dd, yyyy')}
            </div>
          </div>
          {mode === 'task' ? (
            <div>
              <span className="text-[9px] font-bold text-stone-400 uppercase tracking-widest block mb-1">Time</span>
              <div className="flex items-center gap-2 text-stone-700 font-bold">
                <Clock className="w-4 h-4 text-orange-500" />
                {formatTimeDisplay(startTime)}
              </div>
            </div>
          ) : (
            <div>
              <span className="text-[9px] font-bold text-stone-400 uppercase tracking-widest block mb-1">Type</span>
              <div className={`flex items-center gap-2 font-bold capitalize ${transType === 'income' ? 'text-green-600' : 'text-red-600'}`}>
                {transType === 'income' ? <ArrowDownLeft className="w-4 h-4" /> : <ArrowUpRight className="w-4 h-4" />}
                {transType}
              </div>
            </div>
          )}
        </div>

        {mode === 'task' && (
          <div className="grid grid-cols-2 gap-6 pt-4 border-t border-stone-200">
            <div>
              <span className="text-[9px] font-bold text-stone-400 uppercase tracking-widest block mb-1">Category</span>
              <div className="flex items-center gap-2 text-stone-700 font-bold capitalize">
                {category === 'job' && <Briefcase className="w-4 h-4 text-blue-500" />}
                {category === 'program' && <Users className="w-4 h-4 text-purple-500" />}
                {category === 'reminder' && <Bell className="w-4 h-4 text-green-500" />}
                {category}
              </div>
            </div>
            <div>
              <span className="text-[9px] font-bold text-stone-400 uppercase tracking-widest block mb-1">Location</span>
              <div className="flex items-center gap-2 text-stone-700 font-bold">
                <MapPin className="w-4 h-4 text-orange-500" />
                {location || 'Not set'}
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-6 pt-4 border-t border-stone-200">
          <div>
            <span className="text-[9px] font-bold text-stone-400 uppercase tracking-widest block mb-1">
              {mode === 'task' ? 'Earnings' : 'Amount'}
            </span>
            <div className={`flex items-center gap-2 font-bold ${mode === 'task' || transType === 'income' ? 'text-green-700' : 'text-red-700'}`}>
              <IndianRupee className="w-4 h-4" />
              {mode === 'task' ? (hasEarning ? earningAmount || '0' : '0') : transAmount || '0'}
            </div>
          </div>
        </div>

        {(mode === 'task' ? description : transDescription) && (
          <div className="pt-4 border-t border-stone-200">
            <span className="text-[9px] font-bold text-stone-400 uppercase tracking-widest block mb-1">Notes</span>
            <p className="text-sm text-stone-600 font-medium italic">"{mode === 'task' ? description : transDescription}"</p>
          </div>
        )}
      </div>
    </div>
  );

  const renderSuccessStep = () => (
    <div className="py-12 flex flex-col items-center justify-center space-y-6 animate-in zoom-in-95 duration-500">
      <div className="w-24 h-24 bg-green-100 rounded-full flex items-center justify-center">
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', damping: 12 }}
        >
          <CheckCircle2 className="w-16 h-16 text-green-600" />
        </motion.div>
      </div>
      <div className="text-center">
        <h3 className="text-2xl font-bold text-stone-800">{mode === 'task' ? 'Task Saved!' : 'Transaction Saved!'}</h3>
        <p className="text-stone-500 font-bold">Your records have been updated.</p>
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 bg-stone-900/60 backdrop-blur-md z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white rounded-t-[2.5rem] sm:rounded-[2.5rem] shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[95vh] sm:max-h-[90vh] border border-stone-200">
        <div className="flex justify-between items-center p-5 sm:p-6 border-b border-stone-100 bg-stone-50/50">
          <h2 className="text-xl sm:text-2xl font-bold text-stone-800 flex items-center gap-3">
            <div className="bg-orange-600 p-1.5 rounded-lg shadow-lg shadow-orange-200">
              {mode === 'task' ? <Briefcase className="w-5 h-5 text-white" /> : <IndianRupee className="w-5 h-5 text-white" />}
            </div>
            {step === 'input' ? (
              (jobToEdit || transactionToEdit) ? `Edit ${mode === 'task' ? 'Task' : 'Transaction'}` : `New ${mode === 'task' ? 'Task' : 'Transaction'}`
            ) : step === 'confirm' ? 'Review Details' : 'Success'}
          </h2>
          <button 
            onClick={onClose}
            className="p-2 rounded-full hover:bg-stone-200 text-stone-400 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="p-5 sm:p-6 overflow-y-auto flex-1">
          <AnimatePresence mode="wait">
            {step === 'input' && (
              <motion.div key="input" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }}>
                {renderInputStep()}
              </motion.div>
            )}
            {step === 'confirm' && (
              <motion.div key="confirm" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                {renderConfirmStep()}
              </motion.div>
            )}
            {step === 'success' && (
              <motion.div key="success" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}>
                {renderSuccessStep()}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="p-5 sm:p-6 border-t border-stone-100 bg-stone-50/50 flex flex-col sm:flex-row gap-3">
          {step === 'input' && (
            <>
              <button
                type="button"
                onClick={onClose}
                className="w-full sm:w-auto px-6 py-3.5 rounded-xl font-bold text-stone-400 hover:bg-stone-200 transition-colors text-sm order-2 sm:order-1"
              >
                Cancel
              </button>
              <button
                type="submit"
                form="job-form"
                className="w-full sm:flex-1 px-8 py-3.5 rounded-xl font-bold text-white bg-orange-600 hover:bg-orange-700 transition-all shadow-lg shadow-orange-100 flex items-center justify-center gap-2 text-sm order-1 sm:order-2"
              >
                Next Step <ArrowRight className="w-4 h-4" />
              </button>
            </>
          )}

          {step === 'confirm' && (
            <>
              <button
                type="button"
                onClick={() => setStep('input')}
                className="w-full sm:w-auto px-6 py-3.5 rounded-xl font-bold text-stone-400 hover:bg-stone-200 transition-colors text-sm order-2 sm:order-1 flex items-center justify-center gap-2"
              >
                <ArrowLeft className="w-4 h-4" /> Go Back
              </button>
              <button
                onClick={handleFinalSubmit}
                disabled={isSubmitting}
                className="w-full sm:flex-1 px-8 py-3.5 rounded-xl font-bold text-white bg-green-600 hover:bg-green-700 transition-all shadow-lg shadow-green-100 flex items-center justify-center gap-2 disabled:opacity-70 text-sm order-1 sm:order-2"
              >
                <Save className="w-4 h-4" />
                {isSubmitting ? 'Saving...' : 'Confirm & Save'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}