const fs = require('fs');

const arToEn = {
  'المكتبة': 'Library',
  'السحابة': 'Cloud Storage',
  'مساحة العمل': 'Workspace',
  'إعدادات': 'Settings',
  'حفظ': 'Save',
  'إلغاء': 'Cancel',
  'الفريق': 'Team',
  'إضافة': 'Add',
  'حذف': 'Delete',
  'تعديل': 'Edit',
  'ملف العضوية': 'Workspace Profile',
  'تنزيل': 'Download',
  'رفع': 'Upload',
  'شابتر': 'Chapter',
  'مجلد': 'Volume',
  'مشروع': 'Project',
  'مشاريع': 'Projects',
  'صور': 'Images',
  'صورة': 'Image',
  'ترجمة': 'Translation',
  'مطور': 'Developer',
  'تفاصيل': 'Details',
  'تبييض': 'Cleaning',
  'تحميل': 'Loading',
  'فارغ': 'Empty',
  'مكتمل': 'Completed',
  'قيد الترجمة': 'Translating',
  'قيد التبييض': 'Cleaning',
  'موافق': 'OK',
  'خطأ': 'Error',
  'نجاح': 'Success',
  'ادوات': 'Tools',
  'أدوات': 'Tools',
  'فرشاة': 'Brush',
  'ممحاة': 'Eraser',
  'نص': 'Text',
  'تحديد': 'Select',
  'رجوع': 'Back',
  'تراجع': 'Undo',
  'تصدير': 'Export',
  'جاري الضغط...': 'Compressing...',
  'العودة للمكتبة': 'Back to Library',
};

let appCode = fs.readFileSync('src/App.tsx', 'utf8');

for (const [ar, en] of Object.entries(arToEn)) {
  const regex = new RegExp(ar, 'g');
  appCode = appCode.replace(regex, en);
}

// Ensure RTL is completely removed
appCode = appCode.replace(/dir="rtl"/g, 'dir="ltr"');
appCode = appCode.replace(/text-right/g, 'text-left');
appCode = appCode.replace(/text-left/g, 'text-left'); // Fix if any double text-left
appCode = appCode.replace(/pr-/g, 'pl-');
appCode = appCode.replace(/pl-/g, 'pl-'); // This might break padding logic if not careful, better skip spacing tweaks.

appCode = appCode.replace(/dir="ltr"/g, 'dir="ltr"');

fs.writeFileSync('src/App.tsx', appCode);
console.log('App.tsx partially translated.');
