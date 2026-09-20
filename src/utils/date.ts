import moment from 'moment';

moment.locale('pt-br');

export function formatDate(date: Date): string {
  return moment(date).format('DD/MM/YYYY');
}

export function formatDateTime(date: Date): string {
  return moment(date).format('DD/MM/YYYY HH:mm');
}

export function parseDate(text: string): Date | null {
  const patterns = [
    { regex: /(\d{1,2})\/(\d{1,2})\/(\d{4})/, format: 'DD/MM/YYYY' },
    { regex: /(\d{1,2})\/(\d{1,2})/, format: 'DD/MM' },
    { regex: /hoje/i, value: 0 },
    { regex: /ontem/i, value: -1 },
    { regex: /amanhã/i, value: 1 }
  ];

  for (const pattern of patterns) {
    if (pattern.value !== undefined) {
      return moment().add(pattern.value, 'days').toDate();
    }

    const match = text.match(pattern.regex);
    if (match) {
      if (match.length === 4) {
        const date = moment(`${match[1]}/${match[2]}/${match[3]}`, pattern.format);
        if (date.isValid()) return date.toDate();
      } else if (match.length === 3) {
        const date = moment(`${match[1]}/${match[2]}/${moment().year()}`, 'DD/MM/YYYY');
        if (date.isValid()) return date.toDate();
      }
    }
  }

  return null;
}

export function getMonthRange(date: Date = new Date()): { start: Date; end: Date } {
  const start = moment(date).startOf('month').toDate();
  const end = moment(date).endOf('month').toDate();
  return { start, end };
}

export function getCurrentMonth(): string {
  return moment().format('YYYY-MM');
}

export function getMonthName(): string {
  return moment().format('MMMM YYYY');
}

export function isDueSoon(dueDate: Date, daysThreshold: number = 3): boolean {
  const now = moment();
  const due = moment(dueDate);
  const diff = due.diff(now, 'days');
  return diff >= 0 && diff <= daysThreshold;
}

export function isOverdue(dueDate: Date): boolean {
  return moment(dueDate).isBefore(moment(), 'day');
}

export function extractDueDate(text: string): Date | null {
  const patterns = [
    /vence\s*(?:dia)?\s*(\d{1,2})/i,
    /(?:dia| até)\s*(\d{1,2})/i,
    /(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?/
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      if (match.length >= 3 && match[2]) {
        const day = parseInt(match[1]);
        const month = parseInt(match[2]) - 1;
        const year = match[3] ? parseInt(match[3]) : moment().year();
        return moment({ year, month, day }).toDate();
      } else if (match[1]) {
        const day = parseInt(match[1]);
        const now = moment();
        let date = moment({ year: now.year(), month: now.month(), day });
        if (date.isBefore(now)) {
          date.add(1, 'month');
        }
        return date.toDate();
      }
    }
  }

  return null;
}
