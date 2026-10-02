export type DayStatus = 'checkin' | 'perdido' | 'hoje_pendente' | 'futuro';

export interface MonthDay {
  date: string; // YYYY-MM-DD
  dayNumber: number;
  status: DayStatus;
  isCurrentMonth: boolean;
}

export interface MilestoneInfo {
  current: number;
  next: number;
  left: number;
}

const MILESTONES = [7, 14, 30, 60, 100, 365];

export function nextMilestone(streak: number): MilestoneInfo {
  let next = MILESTONES.find(m => m > streak) || (streak + 365); // Fallback se passar de 365
  
  return {
    current: streak,
    next: next,
    left: next - streak,
  };
}

export function buildMonthGrid(monthDate: Date, checkinDates: string[], todayStr: string): MonthDay[] {
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  
  // Date-only representações para comparar com string (que vêm como YYYY-MM-DD)
  const today = new Date(todayStr + 'T00:00:00');
  
  const firstDayOfMonth = new Date(year, month, 1);
  const lastDayOfMonth = new Date(year, month + 1, 0);
  
  // Encontrar o domingo anterior ao primeiro dia
  const firstDayOfGrid = new Date(firstDayOfMonth);
  firstDayOfGrid.setDate(firstDayOfGrid.getDate() - firstDayOfGrid.getDay());
  
  // Encontrar o sábado posterior ao último dia
  const lastDayOfGrid = new Date(lastDayOfMonth);
  if (lastDayOfGrid.getDay() !== 6) {
    lastDayOfGrid.setDate(lastDayOfGrid.getDate() + (6 - lastDayOfGrid.getDay()));
  }
  
  const grid: MonthDay[] = [];
  const currentDate = new Date(firstDayOfGrid);
  
  const checkinSet = new Set(checkinDates);

  while (currentDate <= lastDayOfGrid) {
    // Formatar YYYY-MM-DD localmente, já que currentDate tá meia noite
    const y = currentDate.getFullYear();
    const m = String(currentDate.getMonth() + 1).padStart(2, '0');
    const d = String(currentDate.getDate()).padStart(2, '0');
    const dateStr = `${y}-${m}-${d}`;
    
    let status: DayStatus;
    
    if (currentDate > today) {
      status = 'futuro';
    } else if (dateStr === todayStr) {
      status = checkinSet.has(dateStr) ? 'checkin' : 'hoje_pendente';
    } else {
      status = checkinSet.has(dateStr) ? 'checkin' : 'perdido';
    }
    
    grid.push({
      date: dateStr,
      dayNumber: currentDate.getDate(),
      status,
      isCurrentMonth: currentDate.getMonth() === month,
    });
    
    currentDate.setDate(currentDate.getDate() + 1);
  }
  
  return grid;
}
