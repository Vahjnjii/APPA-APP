import { useState, useMemo } from 'react';
import { Transaction } from '../types';
import { format, parseISO, getYear, getMonth, startOfYear, endOfYear, eachMonthOfInterval, getDate } from 'date-fns';
import { ChevronLeft, ChevronRight, ArrowLeft, Edit2, ArrowUpRight, ArrowDownLeft, X, Trash2, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface TransactionHistoryProps {
  transactions: Transaction[];
  onEditTransaction: (trans: Transaction) => void;
  onDeleteTransaction: (id: string) => void;
  onBack?: () => void;
}

export default function TransactionHistory({ transactions, onEditTransaction, onDeleteTransaction, onBack }: TransactionHistoryProps) {
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [hoveredDate, setHoveredDate] = useState<string | null>(null);
  const [itemToDelete, setItemToDelete] = useState<string | null>(null);

  const months = useMemo(() => {
    const start = startOfYear(new Date(selectedYear, 0, 1));
    const end = endOfYear(new Date(selectedYear, 0, 1));
    return eachMonthOfInterval({ start, end });
  }, [selectedYear]);

  // Group transactions by date for the selected year
  const transactionsByDate = useMemo(() => {
    const grouped: Record<string, Transaction[]> = {};
    transactions.forEach(t => {
      const d = parseISO(t.date);
      if (getYear(d) === selectedYear) {
        if (!grouped[t.date]) grouped[t.date] = [];
        grouped[t.date].push(t);
      }
    });
    return grouped;
  }, [transactions, selectedYear]);

  const displayTransactions = useMemo(() => {
    if (!selectedDate) return [];
    return transactionsByDate[selectedDate] || [];
  }, [transactionsByDate, selectedDate]);

  return (
    <div className="space-y-8 pb-24">
      {/* Year Selector */}
      <div className="flex items-center justify-between gap-6 px-2">
        {onBack && (
          <button 
            onClick={onBack}
            className="p-3 bg-stone-100 rounded-2xl text-stone-600 hover:bg-stone-200 transition-all"
          >
            <ArrowLeft className="w-6 h-6" />
          </button>
        )}
        <div className="flex items-center gap-6">
          <button 
            onClick={() => setSelectedYear(prev => prev - 1)}
            className="p-2 hover:bg-stone-100 rounded-full transition-all text-stone-400 hover:text-stone-900"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
          <h3 className="text-3xl font-black text-stone-900 tracking-tighter">
            {selectedYear}
          </h3>
          <button 
            onClick={() => setSelectedYear(prev => prev + 1)}
            className="p-2 hover:bg-stone-100 rounded-full transition-all text-stone-400 hover:text-stone-900"
          >
            <ChevronRight className="w-6 h-6" />
          </button>
        </div>
        <div className="w-12" />
      </div>

      {/* Vertical Month List */}
      <div className="space-y-10">
        {months.map((monthDate, monthIdx) => {
          const monthTransactions = Object.keys(transactionsByDate).filter(dateStr => {
            const d = parseISO(dateStr);
            return getMonth(d) === monthIdx;
          }).sort();

          if (monthTransactions.length === 0) return null;

          return (
            <div key={monthIdx} className="space-y-4">
              <h4 className="text-sm font-black text-stone-400 uppercase tracking-[0.2em] px-1">
                {format(monthDate, 'MMMM')}
              </h4>
              <div className="flex flex-wrap gap-2">
                {monthTransactions.map((dateStr) => {
                  const dateObj = parseISO(dateStr);
                  return (
                    <div key={dateStr} className="relative group">
                      <button
                        onClick={() => setSelectedDate(dateStr)}
                        onMouseEnter={() => setHoveredDate(dateStr)}
                        onMouseLeave={() => setHoveredDate(null)}
                        className="flex items-center justify-center w-8 h-8 rounded-lg bg-white border border-stone-100 shadow-sm hover:border-orange-500 hover:bg-orange-50 transition-all active:scale-95"
                      >
                        <span className="text-[10px] font-bold text-stone-800">
                          {getDate(dateObj)}
                        </span>
                      </button>

                      {/* Hover Preview */}
                      <AnimatePresence>
                        {hoveredDate === dateStr && (
                          <motion.div
                            initial={{ opacity: 0, y: 10, scale: 0.95 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: 10, scale: 0.95 }}
                            className="absolute bottom-full left-1/2 -translate-x-1/2 mb-3 w-56 bg-stone-900 text-white p-4 rounded-2xl shadow-2xl z-[50] pointer-events-none border border-white/10 backdrop-blur-md"
                          >
                            <div className="space-y-3">
                              <p className="text-[10px] font-black text-stone-400 uppercase tracking-widest border-b border-stone-800 pb-2">
                                {format(parseISO(dateStr), 'MMM dd, yyyy')}
                              </p>
                              <div className="space-y-2.5">
                                {transactionsByDate[dateStr].slice(0, 3).map((t) => (
                                  <div key={t.id} className="flex justify-between items-start gap-3">
                                    <div className="min-w-0">
                                      <p className="text-[11px] font-black truncate text-stone-100">{t.description}</p>
                                      <p className="text-[9px] font-bold text-stone-500 uppercase tracking-tighter">{t.category}</p>
                                    </div>
                                    <p className={`text-[11px] font-black whitespace-nowrap ${t.type === 'income' ? 'text-green-400' : 'text-red-400'}`}>
                                      {t.type === 'income' ? '+' : '-'}₹{t.amount.toLocaleString()}
                                    </p>
                                  </div>
                                ))}
                                {transactionsByDate[dateStr].length > 3 && (
                                  <p className="text-[9px] text-stone-500 text-center font-black uppercase tracking-widest pt-1">
                                    + {transactionsByDate[dateStr].length - 3} more
                                  </p>
                                )}
                              </div>
                            </div>
                            {/* Arrow */}
                            <div className="absolute top-full left-1/2 -translate-x-1/2 border-[6px] border-transparent border-t-stone-900" />
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}

        {Object.keys(transactionsByDate).length === 0 && (
          <div className="text-center py-20 bg-stone-50 rounded-[3rem] border-2 border-dashed border-stone-200 mx-2">
            <p className="text-stone-400 font-bold">No transactions recorded in {selectedYear}</p>
          </div>
        )}
      </div>

      {/* Bottom Door (Drawer) */}
      <AnimatePresence>
        {selectedDate && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedDate(null)}
              className="fixed inset-0 bg-stone-900/40 backdrop-blur-sm z-[100]"
            />
            <motion.div 
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed bottom-0 left-0 right-0 bg-stone-50 rounded-t-[3rem] z-[101] max-h-[85vh] overflow-hidden flex flex-col shadow-2xl"
            >
              {/* Handle */}
              <div className="w-12 h-1.5 bg-stone-300 rounded-full mx-auto mt-4 mb-2" />
              
              <div className="p-6 pt-2 flex items-center justify-between border-b border-stone-200 bg-white">
                <div>
                  <h3 className="text-xl font-black text-stone-900 tracking-tight">
                    {format(parseISO(selectedDate), 'MMMM dd, yyyy')}
                  </h3>
                  <p className="text-stone-500 text-xs font-bold uppercase tracking-widest mt-1">
                    {displayTransactions.length} Transactions
                  </p>
                </div>
                <button 
                  onClick={() => setSelectedDate(null)}
                  className="p-3 bg-stone-100 rounded-2xl text-stone-500 hover:bg-stone-200 transition-all"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-4 no-scrollbar">
                {displayTransactions.map((t) => (
                  <div 
                    key={t.id}
                    className="bg-white p-5 rounded-[2rem] border border-stone-100 shadow-sm hover:shadow-md transition-all"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className={`p-4 rounded-2xl ${t.type === 'income' ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-600'}`}>
                          {t.type === 'income' ? <ArrowUpRight className="w-6 h-6" /> : <ArrowDownLeft className="w-6 h-6" />}
                        </div>
                        <div>
                          <h4 className="font-bold text-stone-800 text-lg leading-tight">{t.description}</h4>
                          <div className="flex items-center gap-2 text-xs text-stone-400 font-bold mt-1">
                            <span className="bg-stone-100 px-2 py-0.5 rounded-lg uppercase tracking-wider">{t.category}</span>
                            {t.title && <span>• {t.title}</span>}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <p className={`font-black text-xl ${t.type === 'income' ? 'text-green-600' : 'text-red-600'}`}>
                            {t.type === 'income' ? '+' : '-'}₹{t.amount.toLocaleString()}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <button 
                            onClick={() => {
                              onEditTransaction(t);
                              setSelectedDate(null);
                            }}
                            className="p-2 text-stone-300 hover:text-orange-600 hover:bg-orange-50 rounded-xl transition-all"
                          >
                            <Edit2 className="w-5 h-5" />
                          </button>
                          <button 
                            onClick={() => {
                              setItemToDelete(t.id);
                            }}
                            className="p-2 text-stone-300 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all"
                          >
                            <Trash2 className="w-5 h-5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {itemToDelete && (
          <div className="fixed inset-0 bg-stone-900/60 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="bg-white rounded-[2rem] w-full max-w-sm p-8 shadow-2xl border border-stone-100"
            >
              <div className="flex flex-col items-center text-center">
                <div className="w-16 h-16 bg-red-50 rounded-2xl flex items-center justify-center mb-6">
                  <AlertCircle className="w-8 h-8 text-red-500" />
                </div>
                <h3 className="text-2xl font-bold text-stone-800 mb-2">Delete Transaction?</h3>
                <p className="text-stone-500 font-medium mb-8">This action cannot be undone. Are you sure you want to remove this transaction?</p>
                
                <div className="grid grid-cols-2 gap-3 w-full">
                  <button
                    onClick={() => setItemToDelete(null)}
                    className="py-4 rounded-2xl font-bold text-stone-400 bg-stone-50 hover:bg-stone-100 transition-all uppercase tracking-widest text-xs"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => {
                      if (itemToDelete) {
                        onDeleteTransaction(itemToDelete);
                        if (displayTransactions.length === 1) setSelectedDate(null);
                        setItemToDelete(null);
                      }
                    }}
                    className="py-4 rounded-2xl font-bold text-white bg-red-500 hover:bg-red-600 shadow-lg shadow-red-100 transition-all uppercase tracking-widest text-xs"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
