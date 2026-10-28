# Deploy SnapFind to GitHub Pages / نشر SnapFind على GitHub Pages

Free, static, no server. GitHub builds the site and hosts the AI model files on the same site, so the
instructor's browser never sends images or queries anywhere.

## English

1. **Create the repository.** On github.com: **New repository** → name `snapfind` → **Public** → do *not* add a README → **Create repository**.
2. **Upload the code** (pick one):
   - *Website:* on the empty repo page click **uploading an existing file**, drag **everything inside** the unzipped `snapfind` folder (including the `.github` folder) → **Commit changes**.
   - *Git:* in the unzipped `snapfind` folder:
     ```bash
     git init -b main
     git add .
     git commit -m "SnapFind"
     git remote add origin https://github.com/<your-user>/snapfind.git
     git push -u origin main
     ```
3. **Turn on Pages.** Repo → **Settings** → **Pages** → *Build and deployment* → **Source: GitHub Actions**.
4. **Run the deployment.** Repo → **Actions** → **Deploy to GitHub Pages**. If the first run failed because Pages was not on yet,
   open it and click **Re-run all jobs**. It takes about 3–5 minutes (it downloads the ~220 MB model once).
5. **Open the site:** `https://<your-user>.github.io/snapfind/` (also shown on the finished run).

### Check it before sending the link
- [ ] The AI model card turns green: “Model ready (WebGPU)” or “(WASM)”. First visit downloads ~220 MB.
- [ ] **Use sample images** → all 14 show **Ready**.
- [ ] `قطة` → the cat photo is first. `a cup of coffee` → the coffee photo is first.
- [ ] `فاتورة` → the Arabic receipt appears (with “Text match”).
- [ ] Refresh the page → the images are still there.

### Optional: measure accuracy on GitHub
Actions → **Model feasibility** → **Run workflow**. When it finishes, the **Releases** page has `feasibility-*.json/.log` with
Arabic and English top-1/top-3 accuracy on 30 queries each, plus download and inference times, for 3 candidate models.

### Notes for the instructor
- Use a recent Chrome or Edge on a laptop/desktop (WebGPU makes it faster; WASM fallback works everywhere but is slower).
- The first visit downloads the model (~220 MB); later visits load it from the browser cache.
- Everything stays in the browser (IndexedDB). Add `?db=test` to the URL for a separate scratch library.

## العربية

1. **أنشئ المستودع:** في github.com اضغط **New repository** ← الاسم `snapfind` ← **Public** ← بدون README ← **Create repository**.
2. **ارفع الملفات:** في صفحة المستودع الفارغ اضغط **uploading an existing file** واسحب **كل محتويات** مجلد `snapfind` بعد فك الضغط (بما فيها مجلد `.github`) ثم **Commit changes**.
3. **فعّل Pages:** ‏**Settings** ← **Pages** ← **Source: GitHub Actions**.
4. **شغّل النشر:** ‏**Actions** ← **Deploy to GitHub Pages**. إذا فشل التشغيل الأول لأن Pages لم يكن مفعّلاً، افتحه واضغط **Re-run all jobs**. يستغرق 3–5 دقائق.
5. **افتح الموقع:** `https://<اسم-المستخدم>.github.io/snapfind/`

**تحقق قبل إرسال الرابط:** يظهر «النموذج جاهز» باللون الأخضر، ثم «استخدم الصور التجريبية» وتصبح كل الصور «جاهزة»، ثم ابحث عن «قطة» و«a cup of coffee» و«فاتورة»، ثم حدّث الصفحة وتأكد أن الصور ما زالت موجودة.
