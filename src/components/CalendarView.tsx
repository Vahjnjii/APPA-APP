import React, { useState } from 'react';
import { 
  format, 
  addMonths, 
  subMonths, 
  startOfMonth, 
  endOfMonth, 
  startOfWeek, 
  endOfWeek, 
  isSameMonth, 
  isSameDay, 
  addDays, 
  parseISO
} from 'date-fns';
import { ChevronLeft, ChevronRight, Wallet } from 'lucide-react';
import { Job, Transaction } from '../types';

interface CalendarViewProps {
  selectedDate: Date;
  onSelectDate: (date: Date, hasActivities: boolean) => void;
  jobs: Job[];
  transactions: Transaction[];
}

export default function CalendarView({ selectedDate, onSelectDate, jobs, transactions }: CalendarViewProps) {
  const [currentMonth, setCurrentMonth] = useState(new Date());

  const nextMonth = () => setCurrentMonth(addMonths(currentMonth, 1));
  const prevMonth = () => setCurrentMonth(subMonths(currentMonth, 1));

  const renderHeader = () => {
    return (
      <div className="flex justify-between items-center mb-2 sm:mb-4">
        <button onClick={prevMonth} className="p-1 sm:p-2 rounded-full hover:bg-stone-100 text-stone-600 transition-colors">
          <ChevronLeft className="w-6 h-6" />
        </button>
        <h2 className="text-xl font-bold text-stone-800">
          {format(currentMonth, 'MMMM yyyy')}
        </h2>
        <button onClick={nextMonth} className="p-2 rounded-full hover:bg-stone-100 text-stone-600 transition-colors">
          <ChevronRight className="w-6 h-6" />
        </button>
      </div>
    );
  };

  const renderDays = () => {
    const days = [];
    const startDate = startOfWeek(currentMonth);
    for (let i = 0; i < 7; i++) {
      days.push(
        <div key={i} className="text-center font-semibold text-stone-400 text-sm py-2">
          {format(addDays(startDate, i), 'EEE')}
        </div>
      );
    }
    return <div className="grid grid-cols-7 mb-1 sm:mb-2">{days}</div>;
  };

  const renderCells = () => {
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(monthStart);
    const startDate = startOfWeek(monthStart);
    const endDate = endOfWeek(monthEnd);

    const rows = [];
    let days = [];
    let day = startDate;
    let formattedDate = '';

    while (day <= endDate) {
      for (let i = 0; i < 7; i++) {
        formattedDate = format(day, 'd');
        const cloneDay = day;
        const dateStr = format(cloneDay, 'yyyy-MM-dd');
        
        // Check if day has jobs or transactions
        const dayJobs = jobs.filter(j => j.date === dateStr);
        const dayTrans = transactions.filter(t => t.date === dateStr);
        
        const hasJobs = dayJobs.length > 0;
        const hasJobCategory = dayJobs.some(j => j.category === 'job');
        const hasProgramCategory = dayJobs.some(j => j.category === 'program');
        const hasReminderCategory = dayJobs.some(j => j.category === 'reminder');
        const hasTransactions = dayTrans.length > 0;
        
        const isSelected = isSameDay(day, selectedDate);
        
        // Determine border categories and their thicknesses
        const categories = [];
        if (hasJobCategory) categories.push({ color: '#1c1917', thickness: 2 }); // stone-900 (Black)
        if (hasProgramCategory) categories.push({ color: '#3b82f6', thickness: 2 }); // blue-500 (Blue)
        if (hasReminderCategory) categories.push({ color: '#22c55e', thickness: 2 }); // green-500 (Green)

        let dayColorClass = 'text-stone-700 bg-white';
        let customStyle: React.CSSProperties = {
          boxShadow: 'inset 0 0 0 1px #f1f1f0' // Default very subtle inset border
        };

        if (hasJobs) {
          dayColorClass = isSelected ? 'bg-stone-100 text-stone-900 z-10 font-bold' : 'bg-stone-50 text-stone-700';
          
          let currentThickness = 0;
          const shadows = categories.map((cat) => {
            currentThickness += cat.thickness;
            return `inset 0 0 0 ${currentThickness}px ${cat.color}`;
          });
          
          if (isSelected) {
            shadows.push('0 10px 15px -3px rgb(0 0 0 / 0.1)');
          }
          
          customStyle = { 
            boxShadow: shadows.length > 0 ? shadows.join(', ') : 'inset 0 0 0 1px #f1f1f0'
          };
        } else if (isSelected) {
          dayColorClass = 'bg-orange-50 text-orange-700 z-10 font-bold';
          customStyle = {
            boxShadow: 'inset 0 0 0 2px #fed7aa, 0 1px 2px 0 rgb(0 0 0 / 0.05)' // orange-200 inset + shadow-sm
          };
        }

        days.push(
          <button
            key={day.toString()}
            onClick={() => onSelectDate(cloneDay, hasJobs || hasTransactions)}
            style={customStyle}
            className={`
              relative flex flex-col items-center justify-center p-0.5 sm:p-2 h-12 sm:h-20 w-full
              rounded-lg sm:rounded-2xl transition-all outline-none
              ${!isSameMonth(day, monthStart) ? 'text-stone-300 opacity-40' : dayColorClass}
              ${!isSelected ? 'hover:bg-stone-50 hover:shadow-[inset_0_0_0_1px_#e5e7eb]' : ''}
            `}
          >
            {hasJobs && (
              <div className="absolute -top-1.5 -right-1.5 flex flex-col gap-1 items-end z-20">
                <span className={`text-[9px] sm:text-[11px] font-bold px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-full shadow-md border border-white/20 ${isSelected ? 'bg-white text-stone-800' : 'bg-stone-800 text-white'}`}>
                  {dayJobs.length}
                </span>
              </div>
            )}
            <span className="text-sm sm:text-lg">{formattedDate}</span>
            <div className="flex flex-wrap justify-center gap-1 mt-1 px-1">
              {hasProgramCategory && <div className={`w-1 h-1 rounded-full bg-blue-500`} />}
              {hasReminderCategory && <div className={`w-1 h-1 rounded-full bg-green-500`} />}
              {hasTransactions && <div className={`w-1.5 h-1.5 rounded-full bg-yellow-400 shadow-sm`} />}
            </div>
          </button>
        );
        day = addDays(day, 1);
      }
      rows.push(
        <div className="grid grid-cols-7 gap-1 mb-1" key={day.toString()}>
          {days}
        </div>
      );
      days = [];
    }
    return <div>{rows}</div>;
  };

  return (
    <div className="bg-white p-2 sm:p-6 rounded-[2rem] shadow-xl shadow-stone-200/50 border border-stone-100">
      {renderHeader()}
      <div className="p-1 sm:p-4">
        {renderDays()}
        {renderCells()}
      </div>
      
      <div className="mt-4 flex flex-wrap justify-center gap-x-4 gap-y-2 text-[9px] font-bold uppercase tracking-widest text-stone-400">
        <div className="flex items-center gap-1.5">
          <div className="h-1.5 w-3 rounded-full bg-stone-900 shadow-sm"></div>
          <span>Jobs</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="h-1.5 w-3 rounded-full bg-blue-500 shadow-sm"></div>
          <span>Programs</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="h-1.5 w-3 rounded-full bg-green-500 shadow-sm"></div>
          <span>Reminders</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="h-1.5 w-3 rounded-full bg-amber-500 shadow-sm"></div>
          <span>Transactions</span>
        </div>
      </div>
    </div>
  );
}
