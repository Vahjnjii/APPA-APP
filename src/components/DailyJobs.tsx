import { Job, Transaction } from '../types';
import { format } from 'date-fns';
import { Clock, IndianRupee, Briefcase, Plus, Star, PartyPopper, Users, Edit2, Trash2, Calendar, AlertCircle, MapPin, ArrowUpRight, ArrowDownLeft, Wallet, Bell } from 'lucide-react';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { doc, deleteDoc } from 'firebase/firestore';
import { useState } from 'react';

interface DailyJobsProps {
  date: Date;
  jobs: Job[];
  transactions: Transaction[];
  onAddJob: () => void;
  onEditJob: (job: Job) => void;
  onEditTransaction: (trans: Transaction) => void;
  onDeleteJob: (id: string) => void;
  onDeleteTransaction: (id: string) => void;
}

const formatTime = (time?: string) => {
  if (!time) return '';
  const [hours, minutes] = time.split(':');
  const h = parseInt(hours);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${minutes} ${ampm}`;
};

interface JobStripProps {
  key?: string;
  job: Job;
  onEdit: (job: Job) => void;
  onDelete: (jobId: string) => void;
}

const JobStrip = ({ job, onEdit, onDelete }: JobStripProps) => {
  const isReminder = job.category === 'reminder';
  const isProgram = job.category === 'program';
  const isJob = job.category === 'job';
  
  let borderColor = 'border-stone-100';
  let dotColor = 'bg-stone-200';
  let borderThickness = 'border';
  
  if (isJob) {
    borderColor = 'border-stone-900';
    dotColor = 'bg-stone-900';
    borderThickness = 'border-2';
  } else if (isProgram) {
    borderColor = 'border-blue-500';
    dotColor = 'bg-blue-500';
  } else if (isReminder) {
    borderColor = 'border-green-500';
    dotColor = 'bg-green-500';
  }

  return (
    <div 
      className={`group relative p-2 sm:p-3 rounded-xl bg-white transition-all flex items-center justify-between gap-3 ${borderColor} ${borderThickness} shadow-sm hover:shadow-md`}
    >
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <div className={`w-2 h-2 rounded-full shrink-0 ${dotColor}`} />
        <div className="flex flex-col min-w-0">
          <h3 className="text-sm sm:text-base font-bold text-stone-800 leading-tight">
            {job.title}
          </h3>
          <div className="flex items-center gap-2 mt-0.5">
            {job.startTime && (
              <span className="text-[10px] font-bold text-stone-500 uppercase flex items-center gap-1">
                <Clock className="w-3 h-3" /> {formatTime(job.startTime)}
              </span>
            )}
            {job.location && (
              <span className="text-[10px] font-bold text-stone-500 uppercase flex items-center gap-1">
                <MapPin className="w-3 h-3" /> {job.location}
              </span>
            )}
            {!isReminder && job.hasEarning && job.earningAmount > 0 && (
              <span className="text-[10px] font-bold text-green-600 uppercase flex items-center gap-0.5">
                <IndianRupee className="w-3 h-3" /> {job.earningAmount.toLocaleString('en-IN')}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-1 shrink-0">
        <button 
          onClick={() => onEdit(job)}
          className="p-1.5 text-stone-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
          title="Edit"
        >
          <Edit2 className="w-3.5 h-3.5" />
        </button>
        <button 
          onClick={() => onDelete(job.id)}
          className="p-1.5 text-stone-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
          title="Delete"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};

interface TransactionStripProps {
  key?: string;
  transaction: Transaction;
  onEdit: (trans: Transaction) => void;
  onDelete: (transId: string) => void;
}

const TransactionStrip = ({ transaction, onEdit, onDelete }: TransactionStripProps) => {
  const isIncome = transaction.type === 'income';
  
  return (
    <div 
      className={`group relative p-2 sm:p-3 rounded-xl bg-white transition-all flex items-center justify-between gap-3 border shadow-sm hover:shadow-md ${isIncome ? 'border-green-200' : 'border-red-200'}`}
    >
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <div className={`w-2 h-2 rounded-full shrink-0 ${isIncome ? 'bg-green-500' : 'bg-red-500'}`} />
        <div className="flex flex-col min-w-0">
          <h3 className="text-sm sm:text-base font-bold text-stone-800 leading-tight">
            {transaction.title}
          </h3>
          <div className="flex items-center gap-2 mt-0.5">
            <span className={`text-[10px] font-bold uppercase flex items-center gap-0.5 ${isIncome ? 'text-green-600' : 'text-red-600'}`}>
              {isIncome ? <ArrowDownLeft className="w-3 h-3" /> : <ArrowUpRight className="w-3 h-3" />}
              <IndianRupee className="w-3 h-3" /> {transaction.amount.toLocaleString('en-IN')}
            </span>
            {transaction.description && (
              <span className="text-[10px] font-medium text-stone-400 truncate max-w-[150px]">
                {transaction.description}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-1 shrink-0">
        <button 
          onClick={() => onEdit(transaction)}
          className="p-1.5 text-stone-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
          title="Edit"
        >
          <Edit2 className="w-3.5 h-3.5" />
        </button>
        <button 
          onClick={() => onDelete(transaction.id)}
          className="p-1.5 text-stone-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
          title="Delete"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};

export default function DailyJobs({ date, jobs, transactions, onAddJob, onEditJob, onEditTransaction, onDeleteJob, onDeleteTransaction }: DailyJobsProps) {
  const [itemToDelete, setItemToDelete] = useState<{ id: string, type: 'job' | 'transaction' } | null>(null);
  const formattedDate = format(date, 'EEEE, MMMM do');

  const handleDelete = async () => {
    if (!itemToDelete) return;
    
    if (itemToDelete.type === 'job') {
      onDeleteJob(itemToDelete.id);
    } else {
      onDeleteTransaction(itemToDelete.id);
    }
    setItemToDelete(null);
  };

  const jobsList = jobs.filter(j => j.category === 'job');
  const programsList = jobs.filter(j => j.category === 'program');
  const remindersList = jobs.filter(j => j.category === 'reminder');

  const totalDailyEarnings = jobs.reduce((sum, j) => sum + (j.hasEarning ? j.earningAmount : 0), 0);

  return (
    <div className="bg-white p-6 sm:p-8 rounded-[2.5rem] shadow-xl shadow-stone-200/50 border border-stone-100 min-h-[400px] flex flex-col">
      <div className="flex flex-col sm:flex-row justify-between items-start gap-4 mb-8">
        <div className="flex items-center gap-4">
          <div className="bg-stone-900 text-white w-12 h-12 rounded-2xl flex items-center justify-center shadow-lg">
            <Calendar className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-2xl sm:text-3xl font-bold text-stone-800 tracking-tight">{formattedDate}</h2>
          </div>
        </div>
        
        {/* Daily Summary Stats */}
        {jobs.length > 0 && (
          <div className="flex gap-3 w-full sm:w-auto">
            <div className="flex-1 sm:flex-none bg-stone-50 px-4 py-2 rounded-xl border border-stone-100">
              <span className="text-[9px] font-bold text-stone-400 uppercase tracking-widest block mb-0.5">Job Earnings</span>
              <div className="flex items-center gap-1 font-bold text-green-600">
                <IndianRupee className="w-3 h-3" />
                <span className="text-sm">{totalDailyEarnings.toLocaleString()}</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {jobs.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center p-8 bg-stone-50/50 border-2 border-dashed border-stone-100 rounded-[2rem]">
          <div className="bg-white p-6 rounded-3xl shadow-sm mb-4">
            <Briefcase className="w-12 h-12 text-stone-200" />
          </div>
          <h3 className="text-xl font-bold text-stone-700 mb-2">No activities scheduled</h3>
          <p className="text-stone-400 max-w-[200px] mb-8 text-sm font-bold leading-relaxed">Your schedule for this day is currently empty.</p>
          <button
            onClick={onAddJob}
            className="bg-orange-600 hover:bg-orange-700 text-white px-10 py-4 rounded-2xl font-bold text-sm transition-all flex items-center gap-2 shadow-xl shadow-orange-100"
          >
            <Plus className="w-5 h-5" />
            Add Something
          </button>
        </div>
      ) : (
        <div className="space-y-8 flex-1">
          {/* Reminders Section */}
          {remindersList.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 pb-1 border-b border-green-100">
                <Bell className="w-4 h-4 text-green-500" />
                <h4 className="text-[10px] font-bold text-green-500 uppercase tracking-widest">Reminders</h4>
              </div>
              <div className="space-y-1.5">
                {remindersList.map(job => (
                  <JobStrip 
                    key={job.id} 
                    job={job} 
                    onEdit={onEditJob} 
                    onDelete={(id) => setItemToDelete({ id, type: 'job' })} 
                  />
                ))}
              </div>
            </div>
          )}

          {/* Jobs Section */}
          {jobsList.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 pb-1 border-b border-stone-900/10">
                <Briefcase className="w-4 h-4 text-stone-900" />
                <h4 className="text-[10px] font-bold text-stone-900 uppercase tracking-widest">Jobs</h4>
              </div>
              <div className="space-y-1.5">
                {jobsList.map(job => (
                  <JobStrip 
                    key={job.id} 
                    job={job} 
                    onEdit={onEditJob} 
                    onDelete={(id) => setItemToDelete({ id, type: 'job' })} 
                  />
                ))}
              </div>
            </div>
          )}

          {/* Programs Section */}
          {programsList.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 pb-1 border-b border-blue-100">
                <Users className="w-4 h-4 text-blue-500" />
                <h4 className="text-[10px] font-bold text-blue-500 uppercase tracking-widest">Programs</h4>
              </div>
              <div className="space-y-1.5">
                {programsList.map(job => (
                  <JobStrip 
                    key={job.id} 
                    job={job} 
                    onEdit={onEditJob} 
                    onDelete={(id) => setItemToDelete({ id, type: 'job' })} 
                  />
                ))}
              </div>
            </div>
          )}
          
          <button
            onClick={onAddJob}
            className="w-full py-4 rounded-2xl border-2 border-dashed border-stone-200 text-stone-400 hover:text-orange-600 hover:border-orange-200 hover:bg-orange-50/50 transition-all flex items-center justify-center gap-3 font-bold uppercase tracking-widest text-xs"
          >
            <Plus className="w-5 h-5" />
            Add Another Task
          </button>
        </div>
      )}
      {/* Delete Confirmation Modal */}
      {itemToDelete && (
        <div className="fixed inset-0 bg-stone-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-[2rem] w-full max-w-sm p-8 shadow-2xl border border-stone-100 animate-in fade-in zoom-in duration-200">
            <div className="flex flex-col items-center text-center">
              <div className="w-16 h-16 bg-red-50 rounded-2xl flex items-center justify-center mb-6">
                <AlertCircle className="w-8 h-8 text-red-500" />
              </div>
              <h3 className="text-2xl font-bold text-stone-800 mb-2">Delete {itemToDelete.type === 'job' ? 'Task' : 'Transaction'}?</h3>
              <p className="text-stone-500 font-medium mb-8">This action cannot be undone. Are you sure you want to remove this {itemToDelete.type === 'job' ? 'task' : 'transaction'}?</p>
              
              <div className="grid grid-cols-2 gap-3 w-full">
                <button
                  onClick={() => setItemToDelete(null)}
                  className="py-4 rounded-2xl font-bold text-stone-400 bg-stone-50 hover:bg-stone-100 transition-all uppercase tracking-widest text-xs"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDelete}
                  className="py-4 rounded-2xl font-bold text-white bg-red-500 hover:bg-red-600 shadow-lg shadow-red-100 transition-all uppercase tracking-widest text-xs"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

