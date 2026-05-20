import { ProcessedImage } from '../types';

export function createTranslationDoc(images: ProcessedImage[]): string {
  let doc = `====================== ⚠️ تعليمات هامة للمترجمين ⚠️ ======================
1. هذا الملف مخصص لترجمة النصوص وتسهيل عملك ببرامج الترجمة الخارجية.
2. قم بكتابة الترجمة المطلوبة دائماً أسفل كلمة "الترجمة:" مباشرةً فقط.
3. يحظر تماماً تغيير أو مسح السطور التي تبدأ بـ [ID:] لأنها ضرورية لتعرف النظام على المربع.
4. حافظ على وجود السطر الذي يحتوي على [END] بعد نهاية ترجمة كل نص ولا تقم بمسحه أبدا (يعبر عن نهاية المربع النصي).
5. يمكنك بكل حرية استخدام أكثر من سطر (Enter) في الترجمة داخل المربع الواحد.
6. في نهاية هذا الملف يوجد قسم يحمل اسم "بيانات التحرير والاحداثيات". الرجاء عدم لمسه أو حذفه أبداً!
=========================================================================\n\n`;

  images.forEach(img => {
    if (img.regions.length === 0) return;
    doc += `------------------------------------------------------------\n`;
    doc += `📄 الصفحة: ${img.filename}\n`;
    doc += `------------------------------------------------------------\n\n`;
    img.regions.forEach((r, idx) => {
      doc += `[ID: ${r.id}]\n`;
      doc += `💬 النوع: ${r.type === 'bubble' ? 'فقاعة حوار' : 'مؤثر صوتي (SFX)'} | رقم النص: ${idx + 1}\n`;
      doc += `🇯🇵 النص الأصلي:\n${r.originalText || '(فارغ)'}\n\n`;
      doc += `الترجمة:\n${r.translatedText || ''}\n`;
      doc += `[END]\n\n`;
    });
  });

  doc += `============== بيانات التحرير والاحداثيات (لا تلمس هذا الجزء) ==============\n`;
  const metadata = images.map(img => ({
    id: img.id,
    filename: img.filename,
    regions: img.regions.map(r => ({
      id: r.id,
      x: r.x, y: r.y, width: r.width, height: r.height,
      angle: r.angle, textColor: r.textColor, strokeColor: r.strokeColor,
      strokeWidth: r.strokeWidth, bgColor: r.bgColor, fontFamily: r.fontFamily,
      fontSize: r.fontSize, fontWeight: r.fontWeight, fontStyle: r.fontStyle,
      textAlign: r.textAlign, lineHeight: r.lineHeight, autoFitText: r.autoFitText,
      shadowBlur: r.shadowBlur, shadowColor: r.shadowColor
    }))
  }));
  doc += JSON.stringify(metadata);

  return doc;
}

export function parseTranslationDoc(docText: string, currentImages: ProcessedImage[]): ProcessedImage[] {
  const translations: Record<string, string> = {};
  
  // Extract texts based on ID and [END]
  const regex = /\[ID:\s*([a-zA-Z0-9-]+)\][\s\S]*?الترجمة:\n([\s\S]*?)\n(?:\[END\])/g;
  let match;
  while ((match = regex.exec(docText)) !== null) {
     const id = match[1];
     let translated = match[2];
     // remove trailing and leading space/newlines but keep internal ones
     translated = translated.replace(/^\s+|\s+$/g, '');
     translations[id] = translated;
  }

  // Update images maintaining everything else
  return currentImages.map(img => ({
    ...img,
    regions: img.regions.map(r => {
      if (translations[r.id] !== undefined) {
         return { ...r, translatedText: translations[r.id] };
      }
      return r;
    })
  }));
}
