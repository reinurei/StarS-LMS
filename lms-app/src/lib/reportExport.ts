// Report Export Utility (CSV & XLSX) — Requirements 8.6, 12.4
import * as XLSX from 'xlsx';

export interface StudentReportRow {
  studentName: string;
  studentId: string;
  email: string;
  activityGrades: Record<string, string | number>;
  attendancePercentage: number;
}

function escapeCsv(val: string | number | null | undefined): string {
  const s = val === null || val === undefined ? '' : String(val);
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function buildReportTable(
  rows: StudentReportRow[],
  activityColumns: string[],
): (string | number)[][] {
  const header = ['Student Name', 'Student ID', 'Email', ...activityColumns, 'Attendance %'];
  const dataRows = rows.map((r) => [
    r.studentName,
    r.studentId,
    r.email,
    ...activityColumns.map((col) => r.activityGrades[col] ?? 'Missing'),
    `${r.attendancePercentage.toFixed(2)}%`,
  ]);
  return [header, ...dataRows];
}

export function exportReportCsv(
  filename: string,
  rows: StudentReportRow[],
  activityColumns: string[],
): void {
  const table = buildReportTable(rows, activityColumns);
  const csvContent = table.map((row) => row.map(escapeCsv).join(',')).join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  triggerDownload(blob, filename.endsWith('.csv') ? filename : `${filename}.csv`);
}

export function exportReportXlsx(
  filename: string,
  rows: StudentReportRow[],
  activityColumns: string[],
): void {
  const table = buildReportTable(rows, activityColumns);
  const ws = XLSX.utils.aoa_to_sheet(table);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Course Report');
  const buffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  triggerDownload(blob, filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`);
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
