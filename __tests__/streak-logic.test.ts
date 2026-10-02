import { buildMonthGrid, nextMilestone } from '../lib/streak-logic';

describe('Streak Logic', () => {
  describe('nextMilestone', () => {
    it('returns 7 if streak is 0', () => {
      expect(nextMilestone(0)).toEqual({ current: 0, next: 7, left: 7 });
    });

    it('returns 7 if streak is 3', () => {
      expect(nextMilestone(3)).toEqual({ current: 3, next: 7, left: 4 });
    });

    it('returns 30 if streak is 14', () => {
      expect(nextMilestone(14)).toEqual({ current: 14, next: 30, left: 16 });
    });

    it('returns fallback if streak is beyond max predefined', () => {
      expect(nextMilestone(365)).toEqual({ current: 365, next: 365 + 365, left: 365 });
    });
  });

  describe('buildMonthGrid', () => {
    const todayStr = '2023-10-15';
    
    it('builds correct grid for month containing today', () => {
      const monthDate = new Date(2023, 9, 1); // Outubro 2023 (0-indexed)
      const checkins = ['2023-10-10', '2023-10-14']; // Um check-in no passado recente
      
      const grid = buildMonthGrid(monthDate, checkins, todayStr);
      
      expect(grid.length).toBeGreaterThanOrEqual(28); // Grid tem que ter células suficientes

      // Dia 10 (passado, check-in feito)
      const day10 = grid.find(d => d.date === '2023-10-10');
      expect(day10?.status).toBe('checkin');

      // Dia 13 (passado, check-in NAO feito)
      const day13 = grid.find(d => d.date === '2023-10-13');
      expect(day13?.status).toBe('perdido');
      
      // Dia 14 (passado, check-in feito)
      const day14 = grid.find(d => d.date === '2023-10-14');
      expect(day14?.status).toBe('checkin');

      // Dia 15 (hoje, pendente)
      const day15 = grid.find(d => d.date === '2023-10-15');
      expect(day15?.status).toBe('hoje_pendente');

      // Dia 16 (futuro)
      const day16 = grid.find(d => d.date === '2023-10-16');
      expect(day16?.status).toBe('futuro');
    });

    it('builds correct grid when today has checkin', () => {
      const monthDate = new Date(2023, 9, 1);
      const checkins = ['2023-10-15']; // Hoje com check-in
      
      const grid = buildMonthGrid(monthDate, checkins, todayStr);
      
      const day15 = grid.find(d => d.date === '2023-10-15');
      expect(day15?.status).toBe('checkin');
    });

    it('handles previous months (everything without checkin is perdido)', () => {
      const monthDate = new Date(2023, 8, 1); // Setembro
      const checkins = ['2023-09-01'];
      
      const grid = buildMonthGrid(monthDate, checkins, todayStr);
      
      const day1 = grid.find(d => d.date === '2023-09-01');
      expect(day1?.status).toBe('checkin');

      const day2 = grid.find(d => d.date === '2023-09-02');
      expect(day2?.status).toBe('perdido');
    });

    it('handles future months (everything is futuro)', () => {
      const monthDate = new Date(2023, 10, 1); // Novembro
      const checkins: string[] = [];
      
      const grid = buildMonthGrid(monthDate, checkins, todayStr);
      
      const day1 = grid.find(d => d.date === '2023-11-01');
      expect(day1?.status).toBe('futuro');
    });
  });
});
