const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const MARGIN = 42;

function escapePdfText(value) {
  return String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}

function buildPdfObject(id, body) {
  return `${id} 0 obj\n${body}\nendobj\n`;
}

function formatMoney(value) {
  const amount = Number(value || 0);
  return `INR ${amount.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatPlainNumber(value) {
  return Number(value || 0).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatDate(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function getMonthLabel(year, month) {
  return new Date(year, month - 1, 1).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  });
}

function getPayslipFilename(record) {
  const monthName = new Date(record.year, record.month - 1, 1).toLocaleDateString('en-US', {
    month: 'long',
  });
  return `SalarySlip_${monthName}_${record.year}.pdf`;
}

function textWidth(text, size) {
  return String(text ?? '').length * size * 0.48;
}

function clampText(value, maxChars) {
  const text = String(value ?? '-');
  if (text.length <= maxChars) return text;
  return `${text.slice(0, Math.max(maxChars - 3, 0))}...`;
}

function numberToWords(value) {
  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  function belowHundred(num) {
    if (num < 20) return ones[num];
    return [tens[Math.floor(num / 10)], ones[num % 10]].filter(Boolean).join(' ');
  }

  function belowThousand(num) {
    const hundred = Math.floor(num / 100);
    const rest = num % 100;
    return [
      hundred ? `${ones[hundred]} Hundred` : '',
      rest ? belowHundred(rest) : '',
    ].filter(Boolean).join(' ');
  }

  let amount = Math.max(Math.round(Number(value || 0)), 0);
  if (!amount) return 'Zero Rupees Only';

  const parts = [];
  const crore = Math.floor(amount / 10000000);
  amount %= 10000000;
  const lakh = Math.floor(amount / 100000);
  amount %= 100000;
  const thousand = Math.floor(amount / 1000);
  amount %= 1000;

  if (crore) parts.push(`${belowThousand(crore)} Crore`);
  if (lakh) parts.push(`${belowThousand(lakh)} Lakh`);
  if (thousand) parts.push(`${belowThousand(thousand)} Thousand`);
  if (amount) parts.push(belowThousand(amount));

  return `${parts.join(' ')} Rupees Only`;
}

function createPdfCanvas() {
  const commands = [];

  function strokeColor(gray = 0) {
    commands.push(`${gray} G`);
  }

  function fillColor(gray = 0) {
    commands.push(`${gray} g`);
  }

  function lineWidth(width) {
    commands.push(`${width} w`);
  }

  function line(x1, y1, x2, y2, width = 0.6) {
    lineWidth(width);
    commands.push(`${x1} ${y1} m ${x2} ${y2} l S`);
  }

  function rect(x, y, width, height, options = {}) {
    if (options.fillGray !== undefined) {
      fillColor(options.fillGray);
      commands.push(`${x} ${y} ${width} ${height} re f`);
      fillColor(0);
    }
    if (options.stroke !== false) {
      lineWidth(options.lineWidth || 0.6);
      strokeColor(options.strokeGray || 0);
      commands.push(`${x} ${y} ${width} ${height} re S`);
      strokeColor(0);
    }
  }

  function text(value, x, y, options = {}) {
    const size = options.size || 9;
    const font = options.bold ? 'F2' : 'F1';
    const content = escapePdfText(value);
    commands.push(`BT /${font} ${size} Tf ${x} ${y} Td (${content}) Tj ET`);
  }

  function centeredText(value, y, options = {}) {
    const size = options.size || 10;
    const x = (PAGE_WIDTH - textWidth(value, size)) / 2;
    text(value, x, y, options);
  }

  function rightText(value, rightX, y, options = {}) {
    const size = options.size || 9;
    text(value, rightX - textWidth(value, size), y, options);
  }

  return {
    commands,
    centeredText,
    line,
    rect,
    rightText,
    text,
  };
}

function drawEmployeeInfo(canvas, rows) {
  const x = MARGIN;
  const y = 486;
  const width = PAGE_WIDTH - (MARGIN * 2);
  const headerHeight = 24;
  const half = width / 2;
  const rowHeight = 18;
  const labelWidth = 100;
  const splitIndex = Math.ceil(rows.length / 2);
  const leftRows = rows.slice(0, splitIndex);
  const rightRows = rows.slice(splitIndex);
  const bodyRows = Math.max(leftRows.length, rightRows.length);
  const height = headerHeight + (bodyRows * rowHeight);

  canvas.rect(x, y, width, height);
  canvas.rect(x, y + height - headerHeight, width, headerHeight, { fillGray: 0.92 });
  canvas.text('EMPLOYEE INFORMATION', x + 10, y + height - 16, { bold: true, size: 10 });
  canvas.line(x + half, y, x + half, y + height - headerHeight);

  [leftRows, rightRows].forEach((columnRows, column) => {
    const baseX = x + (column * half);
    const bodyTop = y + height - headerHeight;

    for (let rowIndex = 1; rowIndex < columnRows.length; rowIndex += 1) {
      const lineY = bodyTop - (rowIndex * rowHeight);
      canvas.line(baseX, lineY, baseX + half, lineY, 0.3);
    }

    columnRows.forEach((row, rowIndex) => {
      const rowTop = bodyTop - (rowIndex * rowHeight);
      const textY = rowTop - 12;
      canvas.text(row.label, baseX + 10, textY, { bold: true, size: 8.5 });
      canvas.text(':', baseX + labelWidth, textY, { size: 8.5 });
      canvas.text(clampText(row.value, 22), baseX + labelWidth + 10, textY, { size: 8.5 });
    });
  });
}

function drawSalaryTable(canvas, title, rows, x, y, width) {
  const headerHeight = 24;
  const rowHeight = 20;
  const height = headerHeight + (rows.length * rowHeight);
  const amountWidth = 92;

  canvas.rect(x, y, width, height);
  canvas.rect(x, y + height - headerHeight, width, headerHeight, { fillGray: 0.92 });
  canvas.text(title, x + 10, y + height - 16, { bold: true, size: 10 });
  canvas.text('Amount', x + width - amountWidth + 22, y + height - 16, { bold: true, size: 9 });
  canvas.line(x + width - amountWidth, y, x + width - amountWidth, y + height);

  rows.forEach((row, index) => {
    const rowTop = y + height - headerHeight - (index * rowHeight);
    const textY = rowTop - 14;
    canvas.line(x, rowTop, x + width, rowTop, 0.3);
    canvas.text(row.label, x + 10, textY, { bold: row.bold, size: 8.7 });
    canvas.rightText(formatPlainNumber(row.value), x + width - 10, textY, { bold: row.bold, size: 8.7 });
  });

  return height;
}

function drawSummary(canvas, rows, netWords) {
  const x = MARGIN;
  const y = 104;
  const width = PAGE_WIDTH - (MARGIN * 2);
  const height = 98;
  const headerHeight = 24;
  const wordsHeight = 24;
  const labelX = x + 310;
  const amountRight = x + width - 14;
  const bodyTop = y + height - headerHeight;
  const bodyBottom = y + wordsHeight;
  const bodyHeight = bodyTop - bodyBottom;
  const rowHeight = bodyHeight / rows.length;

  canvas.rect(x, y, width, height);
  canvas.rect(x, y + height - headerHeight, width, headerHeight, { fillGray: 0.92 });
  canvas.text('SALARY SUMMARY', x + 10, y + height - 16, { bold: true, size: 10 });

  rows.forEach((row, index) => {
    const rowTop = bodyTop - (index * rowHeight);
    const rowY = rowTop - 14;
    canvas.text(row.label, labelX, rowY, { bold: row.bold, size: row.size || 9 });
    canvas.rightText(formatMoney(row.value), amountRight, rowY, { bold: row.bold, size: row.size || 9 });
  });

  canvas.line(x, bodyBottom, x + width, bodyBottom, 0.4);
  canvas.text('Net Salary in Words:', x + 10, y + 9, { bold: true, size: 8.8 });
  canvas.text(clampText(netWords, 78), x + 112, y + 9, { size: 8.8 });
}

function buildPayslipPdf(record) {
  const employee = record.employee || {};
  const monthLabel = getMonthLabel(record.year, record.month);
  const grossSalary =
    Number(record.basicSalary || 0) +
    Number(record.allowances || 0) +
    Number(record.incentives || 0) +
    Number(record.overtimeAmount || 0);
  const totalDeductions = Number(record.leaveDeduction || 0) + Number(record.otherDeductions || 0);
  const netSalary = Number(record.netSalary || 0);
  const paidDays = Number(record.presentDays || 0) + Number(record.leaveDays || 0);
  const lopDays = Number(record.absentDays || 0);

  const canvas = createPdfCanvas();

  canvas.rect(24, 24, PAGE_WIDTH - 48, PAGE_HEIGHT - 48, { lineWidth: 0.8 });
  canvas.centeredText('TXTILPROS MARKETING AND SERVICE', 790, { bold: true, size: 18 });
  canvas.centeredText('97A, Jagannatha Nagar,', 770, { size: 9.5 });
  canvas.centeredText('1st Floor, Opp. Coimbatore Medical College,', 756, { size: 9.5 });
  canvas.centeredText('Civil Aerodrome Post, Coimbatore - 641014.', 742, { size: 9.5 });
  canvas.line(MARGIN, 724, PAGE_WIDTH - MARGIN, 724, 1);
  canvas.centeredText(`PAY SLIP FOR THE MONTH OF ${monthLabel.toUpperCase()}`, 698, { bold: true, size: 13 });

  drawEmployeeInfo(canvas, [
    { label: 'Employee ID', value: employee.employeeCode || '-' },
    { label: 'Employee Name', value: employee.name || '-' },
    { label: 'Department', value: employee.department || '-' },
    { label: 'Designation', value: employee.designation || employee.jobTitle || employee.role || '-' },
    { label: 'Date of Joining', value: formatDate(employee.dateOfJoining || employee.joiningDate || employee.createdAt) },
    { label: 'Bank Account No.', value: employee.bankAccountNumber || employee.bankAccount || '-' },
    { label: 'UAN Number', value: employee.uanNumber || employee.uan || '-' },
    { label: 'PF Number', value: employee.pfNumber || '-' },
    { label: 'ESI Number', value: employee.esiNumber || '-' },
    { label: 'PAN Number', value: employee.panNumber || employee.pan || '-' },
    { label: 'Paid Days', value: paidDays },
    { label: 'LOP Days', value: lopDays },
    { label: 'Pay Period', value: monthLabel },
  ]);

  const tableY = 246;
  const tableGap = 18;
  const tableWidth = ((PAGE_WIDTH - (MARGIN * 2)) - tableGap) / 2;
  drawSalaryTable(canvas, 'EARNINGS', [
    { label: 'Basic Salary', value: record.basicSalary || 0 },
    { label: 'HRA', value: 0 },
    { label: 'Conveyance Allowance', value: record.allowances || 0 },
    { label: 'Bonus', value: record.incentives || 0 },
    { label: 'Other Allowances', value: record.overtimeAmount || 0 },
    { label: 'Gross Earnings', value: grossSalary, bold: true },
  ], MARGIN, tableY, tableWidth);
  drawSalaryTable(canvas, 'DEDUCTIONS', [
    { label: 'Provident Fund (PF)', value: 0 },
    { label: 'ESI', value: 0 },
    { label: 'Professional Tax (PT)', value: 0 },
    { label: 'TDS', value: 0 },
    { label: 'Advance', value: record.leaveDeduction || 0 },
    { label: 'Loan Deduction', value: 0 },
    { label: 'Other Deductions', value: record.otherDeductions || 0 },
    { label: 'Total Deductions', value: totalDeductions, bold: true },
  ], MARGIN + tableWidth + tableGap, tableY - 40, tableWidth);

  drawSummary(canvas, [
    { label: 'Gross Salary', value: grossSalary },
    { label: 'Total Deductions', value: totalDeductions },
    { label: 'Net Salary', value: netSalary, bold: true, size: 11 },
  ], numberToWords(netSalary));

  canvas.centeredText('This is a system-generated salary slip and does not require a signature.', 62, { size: 8.5 });

  const stream = `${canvas.commands.join('\n')}\n`;
  const objects = [
    buildPdfObject(1, '<< /Type /Catalog /Pages 2 0 R >>'),
    buildPdfObject(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>'),
    buildPdfObject(3, '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>'),
    buildPdfObject(4, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'),
    buildPdfObject(5, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>'),
    buildPdfObject(6, `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}endstream`),
  ];

  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  for (const object of objects) {
    offsets.push(Buffer.byteLength(pdf));
    pdf += object;
  }
  const xrefOffset = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let index = 1; index <= objects.length; index += 1) {
    pdf += `${String(offsets[index]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  return Buffer.from(pdf);
}

module.exports = {
  buildPayslipPdf,
  getPayslipFilename,
};
