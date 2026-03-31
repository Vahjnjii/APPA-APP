import { useState, useMemo } from 'react';
import { Job } from '../types';
import { format, parseISO, startOfMonth, eachDayOfInterval, eachMonthOfInterval, startOfYear, endOfYear, isSameMonth, isSameYear, isWithinInterval, subDays, isSameDay, getDate, getMonth, getYear } from 'date-fns';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { TrendingUp, Briefcase, ArrowUpRight, ArrowDownLeft, X, Clock, MapPin, ChevronLeft, ChevronRight, Trash2, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface EarningsReportProps {
  jobs: Job[];
  onNavigateToDate: (date: Date) => void;
  onDeleteJob: (id: string) => void;
}

type TimeFrame = 'daily' | 'monthly' | 'yearly' | 'custom';
type DetailFilter = 'all' | 'jobs';

export default function EarningsReport({ jobs, onNavigateToDate, onDeleteJob }: EarningsReportProps) {
  const [timeFrame, setTimeFrame] = useState<TimeFrame>('monthly');
  const [customStart, setCustomStart] = useState(format(subDays(new Date(), 30), 'yyyy-MM-dd'));
  const [customEnd, setCustomEnd] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [customViewMode, setCustomViewMode] = useState<'daily' | 'monthly'>('daily');
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [detailFilter, setDetailFilter] = useState<DetailFilter>('all');
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [hoveredDate, setHoveredDate] = useState<string | null>(null);
  const [itemToDelete, setItemToDelete] = useState<string | null>(null);

  const months = useMemo(() => {
    const start = startOfYear(new Date(selectedYear, 0, 1));
    const end = endOfYear(new Date(selectedYear, 0, 1));
    return eachMonthOfInterval({ start, end });
  }, [selectedYear]);

  // Group jobs by date for the selected year
  const jobsByDate = useMemo(() => {
    const grouped: Record<string, Job[]> = {};
    jobs.forEach(j => {
      const d = parseISO(j.date);
      if (getYear(d) === selectedYear) {
        if (!grouped[j.date]) grouped[j.date] = [];
        grouped[j.date].push(j);
      }
    });
    return grouped;
  }, [jobs, selectedYear]);

  const filteredData = useMemo(() => {
    let start: Date;
    let end: Date = new Date();

    if (timeFrame === 'daily') {
      start = subDays(new Date(), 29);
    } else if (timeFrame === 'monthly') {
      start = startOfMonth(subDays(new Date(), 365));
    } else if (timeFrame === 'yearly') {
      start = startOfYear(subDays(new Date(), 365 * 10));
    } else {
      start = parseISO(customStart);
      end = parseISO(customEnd);
    }

    const interval = { start, end };
    const fJobs = jobs.filter(j => isWithinInterval(parseISO(j.date), interval));

    return { jobs: fJobs };
  }, [jobs, timeFrame, customStart, customEnd]);

  const stats = useMemo(() => {
    const jobEarnings = filteredData.jobs.reduce((sum, j) => sum + (j.hasEarning ? j.earningAmount : 0), 0);
    const jobCount = filteredData.jobs.length;
    
    return { jobEarnings, jobCount };
  }, [filteredData]);

  const chartData = useMemo(() => {
    const data: { name: string; label: string; total: number; income: number; expenses: number; dateObj: Date }[] = [];
    
    const processDate = (date: Date, labelFormat: string, nameFormat: string) => {
      const dateStr = format(date, 'yyyy-MM-dd');
      
      const dayJobs = filteredData.jobs.filter(j => {
        if (timeFrame === 'daily' || (timeFrame === 'custom' && customViewMode === 'daily')) {
          return j.date === dateStr;
        }
        const jobDate = parseISO(j.date);
        return isSameMonth(jobDate, date) && isSameYear(jobDate, date);
      });

      const jobIncome = dayJobs.reduce((sum, j) => sum + (j.hasEarning ? j.earningAmount : 0), 0);

      data.push({
        name: format(date, nameFormat),
        label: format(date, labelFormat),
        total: jobIncome,
        income: jobIncome,
        expenses: 0,
        dateObj: date
      });
    };

    if (timeFrame === 'daily' || (timeFrame === 'custom' && customViewMode === 'daily')) {
      const end = timeFrame === 'custom' ? parseISO(customEnd) : new Date();
      const start = timeFrame === 'custom' ? parseISO(customStart) : subDays(end, 29);
      const days = eachDayOfInterval({ start, end });
      days.forEach(day => processDate(day, 'MMM dd', 'dd'));
    } else if (timeFrame === 'monthly' || (timeFrame === 'custom' && customViewMode === 'monthly')) {
      const end = timeFrame === 'custom' ? parseISO(customEnd) : new Date();
      const start = timeFrame === 'custom' ? parseISO(customStart) : startOfMonth(subDays(end, 365));
      const months = eachMonthOfInterval({ start, end });
      months.forEach(month => processDate(month, 'MMMM yyyy', 'MMM'));
    } else if (timeFrame === 'yearly') {
      const end = new Date();
      const start = startOfYear(subDays(end, 365 * 10));
      for (let i = 0; i <= 10; i++) {
        const year = startOfYear(subDays(end, 365 * i));
        const yearJobs = filteredData.jobs.filter(j => isSameYear(parseISO(j.date), year));
        
        const jobIncome = yearJobs.reduce((sum, j) => sum + (j.hasEarning ? j.earningAmount : 0), 0);

        data.push({
          name: format(year, 'yyyy'),
          label: format(year, 'yyyy'),
          total: jobIncome,
          income: jobIncome,
          expenses: 0,
          dateObj: year
        });
      }
      data.sort((a, b) => a.dateObj.getTime() - b.dateObj.getTime());
    }
    
    return data;
  }, [filteredData, timeFrame, customStart, customEnd, customViewMode]);

  const handleBarClick = (data: any) => {
    if (data && data.activePayload && data.activePayload.length > 0) {
      const clickedData = data.activePayload[0].payload;
      setSelectedDate(clickedData.dateObj);
      setDetailFilter('all');
    }
  };

  const detailItems = useMemo(() => {
    let items: { type: 'job'; data: any; date: string }[] = [];
    
    const filterByDate = (date: Date) => {
      const jobsInPeriod = filteredData.jobs.filter(j => {
        const jd = parseISO(j.date);
        if (timeFrame === 'daily' || (timeFrame === 'custom' && customViewMode === 'daily')) {
          return isSameDay(jd, date);
        }
        if (timeFrame === 'monthly' || (timeFrame === 'custom' && customViewMode === 'monthly')) {
          return isSameMonth(jd, date) && isSameYear(jd, date);
        }
        return isSameYear(jd, date);
      });

      return { jobs: jobsInPeriod };
    };

    const source = selectedDate ? filterByDate(selectedDate) : filteredData;

    source.jobs.forEach(j => items.push({ type: 'job', data: j, date: j.date }));

    return items.sort((a, b) => b.date.localeCompare(a.date));
  }, [filteredData, selectedDate, timeFrame, customViewMode]);

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-stone-900 text-white p-3 rounded-xl shadow-2xl border border-stone-700 min-w-[150px]">
          <p className="text-stone-400 text-[10px] font-bold uppercase tracking-widest mb-2 border-b border-stone-700 pb-1">{data.label}</p>
          <div className="space-y-1.5">
            <div className="flex justify-between items-center gap-4">
              <span className="text-[9px] font-bold text-stone-400 uppercase tracking-widest">Job Earnings</span>
              <span className="text-xs font-bold text-green-400">₹{data.income.toLocaleString()}</span>
            </div>
          </div>
          <p className="text-[8px] text-stone-500 mt-2 text-center italic">Click to view details</p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-12">
      {/* Header & Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-stone-800 tracking-tight flex items-center gap-2">
            <TrendingUp className="w-6 h-6 text-green-600" />
            Earnings Report
          </h2>
          <p className="text-stone-400 text-xs font-bold uppercase tracking-widest">Job & Event Performance</p>
        </div>
        
        <div className="flex bg-stone-100 p-1 rounded-xl shadow-inner overflow-x-auto no-scrollbar">
          {(['daily', 'monthly', 'yearly', 'custom'] as TimeFrame[]).map((tf) => (
            <button
              key={tf}
              onClick={() => {
                setTimeFrame(tf);
                setSelectedDate(null);
                setDetailFilter('all');
              }}
              className={`px-3 sm:px-4 py-2 rounded-lg font-bold text-[10px] uppercase tracking-wider transition-all whitespace-nowrap ${timeFrame === tf ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-500 hover:text-stone-700'}`}
            >
              {tf}
            </button>
          ))}
        </div>
      </div>

      {timeFrame === 'custom' && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-4 bg-stone-50 rounded-2xl border border-stone-200">
          <div className="space-y-1">
            <label className="text-[9px] font-bold text-stone-400 uppercase tracking-widest">Start</label>
            <input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} className="w-full p-2 bg-white border border-stone-200 rounded-lg font-bold text-xs outline-none focus:ring-2 ring-orange-500/20" />
          </div>
          <div className="space-y-1">
            <label className="text-[9px] font-bold text-stone-400 uppercase tracking-widest">End</label>
            <input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} className="w-full p-2 bg-white border border-stone-200 rounded-lg font-bold text-xs outline-none focus:ring-2 ring-orange-500/20" />
          </div>
          <div className="space-y-1">
            <label className="text-[9px] font-bold text-stone-400 uppercase tracking-widest">View</label>
            <div className="flex bg-white p-1 rounded-lg border border-stone-200 h-9">
              <button onClick={() => setCustomViewMode('daily')} className={`flex-1 rounded-md text-[10px] font-bold ${customViewMode === 'daily' ? 'bg-stone-900 text-white' : 'text-stone-500'}`}>Daily</button>
              <button onClick={() => setCustomViewMode('monthly')} className={`flex-1 rounded-md text-[10px] font-bold ${customViewMode === 'monthly' ? 'bg-stone-900 text-white' : 'text-stone-500'}`}>Monthly</button>
            </div>
          </div>
        </div>
      )}

      {/* Stats Bento Grid - Simplified */}
      <div className="grid grid-cols-2 gap-3">
        <div className="p-4 bg-white rounded-2xl border border-stone-100 shadow-sm">
          <p className="text-[9px] font-bold text-stone-400 uppercase tracking-widest mb-1">Total Earnings</p>
          <p className="text-xl font-black text-stone-900">₹{stats.jobEarnings.toLocaleString('en-IN')}</p>
        </div>
        
        <div className="p-4 bg-white rounded-2xl border border-stone-100 shadow-sm">
          <p className="text-[9px] font-bold text-stone-400 uppercase tracking-widest mb-1">Total Jobs</p>
          <p className="text-xl font-black text-stone-900">{stats.jobCount}</p>
        </div>
      </div>

      {/* Chart Section */}
      <div className="bg-white p-4 sm:p-6 rounded-[2rem] border border-stone-100 shadow-sm">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-xs font-bold text-stone-400 uppercase tracking-widest flex items-center gap-2">
            <TrendingUp className="w-4 h-4" />
            Earnings Trend
          </h3>
        </div>
        
        <div className="h-[200px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }} onClick={handleBarClick}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis 
                dataKey="name" 
                axisLine={false} 
                tickLine={false} 
                tick={{ fill: '#a8a29e', fontWeight: 700, fontSize: 9 }} 
                dy={10}
              />
              <YAxis 
                axisLine={false} 
                tickLine={false} 
                tick={{ fill: '#a8a29e', fontWeight: 700, fontSize: 9 }} 
                tickFormatter={(value) => `₹${value >= 1000 ? (value/1000).toFixed(1) + 'k' : value}`}
              />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: '#f8fafc', radius: 8 }} />
              <Bar dataKey="total" radius={[4, 4, 0, 0]} maxBarSize={24} className="cursor-pointer">
                {chartData.map((entry, index) => (
                  <Cell 
                    key={`cell-${index}`} 
                    fill="#16a34a" 
                    fillOpacity={selectedDate && isSameDay(entry.dateObj, selectedDate) ? 1 : 0.6}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Date Navigation - Small Boxes */}
      <div className="space-y-6 bg-stone-50 p-6 rounded-[2rem] border border-stone-100">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold text-stone-400 uppercase tracking-widest">Earnings Timeline</h3>
          <div className="flex items-center gap-4">
            <button onClick={() => setSelectedYear(prev => prev - 1)} className="p-1 hover:bg-stone-200 rounded-full transition-all"><ChevronLeft className="w-4 h-4" /></button>
            <span className="text-sm font-black text-stone-900">{selectedYear}</span>
            <button onClick={() => setSelectedYear(prev => prev + 1)} className="p-1 hover:bg-stone-200 rounded-full transition-all"><ChevronRight className="w-4 h-4" /></button>
          </div>
        </div>

        <div className="space-y-8">
          {months.map((monthDate, monthIdx) => {
            const monthJobs = Object.keys(jobsByDate).filter(dateStr => {
              const d = parseISO(dateStr);
              return getMonth(d) === monthIdx;
            }).sort();

            if (monthJobs.length === 0) return null;

            return (
              <div key={monthIdx} className="space-y-3">
                <h4 className="text-[10px] font-black text-stone-400 uppercase tracking-[0.2em]">
                  {format(monthDate, 'MMMM')}
                </h4>
                <div className="flex flex-wrap gap-2">
                  {monthJobs.map((dateStr) => {
                    const dateObj = parseISO(dateStr);
                    const isSelected = selectedDate && isSameDay(dateObj, selectedDate);
                    return (
                    <div key={dateStr} className="relative group">
                      <button
                        onClick={() => setSelectedDate(dateObj)}
                        onMouseEnter={() => setHoveredDate(dateStr)}
                        onMouseLeave={() => setHoveredDate(null)}
                        className={`flex items-center justify-center w-8 h-8 rounded-lg border transition-all active:scale-95 ${
                          isSelected 
                            ? 'bg-green-600 border-green-600 text-white shadow-lg shadow-green-100' 
                            : 'bg-white border-stone-100 text-stone-800 hover:border-green-500 hover:bg-green-50'
                        }`}
                      >
                        <span className="text-[10px] font-bold">
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
                                {jobsByDate[dateStr].slice(0, 3).map((j) => (
                                  <div key={j.id} className="flex justify-between items-start gap-3">
                                    <div className="min-w-0">
                                      <p className="text-[11px] font-black truncate text-stone-100">{j.title}</p>
                                      <p className="text-[9px] font-bold text-stone-500 uppercase tracking-tighter">{j.category}</p>
                                    </div>
                                    <p className="text-[11px] font-black whitespace-nowrap text-green-400">
                                      +₹{j.earningAmount.toLocaleString()}
                                    </p>
                                  </div>
                                ))}
                                {jobsByDate[dateStr].length > 3 && (
                                  <p className="text-[9px] text-stone-500 text-center font-black uppercase tracking-widest pt-1">
                                    + {jobsByDate[dateStr].length - 3} more
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
        </div>
      </div>

      {/* Details List Section */}
      {(selectedDate || detailFilter !== 'all') && (
        <div className="bg-white p-6 rounded-[2rem] border border-stone-100 shadow-sm space-y-4 animate-in slide-in-from-bottom-4 duration-500">
          <div className="flex items-center justify-between border-b border-stone-100 pb-4">
            <div>
              <h3 className="text-lg font-bold text-stone-800">
                {selectedDate ? format(selectedDate, 'MMMM dd, yyyy') : 'Activity Details'}
              </h3>
            </div>
            <button 
              onClick={() => { setSelectedDate(null); setDetailFilter('all'); }}
              className="p-2 hover:bg-stone-100 rounded-full text-stone-400 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="space-y-2 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
            {detailItems.length > 0 ? (
              detailItems.map((item, idx) => (
                <div 
                  key={`${item.type}-${idx}`}
                  onClick={() => onNavigateToDate(parseISO(item.date))}
                  className="flex items-center justify-between p-3 bg-stone-50 rounded-xl border border-stone-100 hover:border-orange-200 transition-all cursor-pointer group"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-blue-100 text-blue-600">
                      <Briefcase className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-stone-800 group-hover:text-orange-600 transition-colors">{item.data.title}</p>
                      <div className="flex items-center gap-2 text-[10px] font-bold text-stone-400 uppercase">
                        <Clock className="w-3 h-3" /> {format(parseISO(item.date), 'MMM dd')}
                        {item.data.location && (
                          <span className="flex items-center gap-1"><MapPin className="w-3 h-3" /> {item.data.location}</span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <p className="text-sm font-black text-green-600">
                        +₹{item.data.earningAmount.toLocaleString()}
                      </p>
                    </div>
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        setItemToDelete(item.data.id);
                      }}
                      className="p-2 text-stone-300 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))
            ) : (
              <div className="py-12 text-center">
                <p className="text-stone-400 text-sm font-medium italic">No items found for this selection</p>
              </div>
            )}
          </div>
        </div>
      )}
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
                <h3 className="text-2xl font-bold text-stone-800 mb-2">Delete Job?</h3>
                <p className="text-stone-500 font-medium mb-8">This action cannot be undone. Are you sure you want to remove this job?</p>
                
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
                        onDeleteJob(itemToDelete);
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

