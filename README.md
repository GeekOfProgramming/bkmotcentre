# 🚗 BK MOT Centre Ltd - Modern Web Platform

A ultra-fast, zero-dependency, modern website rebuild for **BK MOT Centre Ltd** (Smethwick, Birmingham, UK), architected specifically for high-speed edge delivery on **Cloudflare Pages**.

---

## ⚡ Key Highlights
* **Hosting:** 100% Native on **Cloudflare Pages** (Global Edge CDN, 0ms cold starts, free SSL, DDoS protection).
* **Performance:** 100/100 Lighthouse score — pure Semantic HTML5, Vanilla CSS3, and lightweight ES6 JavaScript with zero bulky frameworks or bloated WordPress plugins.
* **Serverless Backend:** Includes Cloudflare Pages Function (`functions/api/contact.js`) for processing MOT & service booking enquiries directly at the edge.
* **Mobile & Local SEO Ready:**
  * Rich Google Schema.org `AutoRepair` structured data (Address, Phone, Operating Hours, Geo-coordinates).
  * UK London live operating hours detection (`Open Today: 9am – 6pm`).
  * Sticky mobile calling bar (`0121 558 9215`) for immediate emergency conversions.
  * Interactive DPF cleaning FAQ accordion.
  * Embedded responsive Google Map.

---

## 📂 Project Structure

```
bkmotcentre/
├── index.html                   # Homepage (Hero, 8 quick services, about snippet, dark services grid, same-day quote)
├── aboutus.html                 # About Us (40 years experience, Triple A mission, workshop photo gallery)
├── services.html                # All Services (Full MOT, DPF, Servicing, Brakes, Suspension, Welding, Diagnostics)
├── dpf-cleaning-service.html    # DPF Cleaning Speciality (Filter explanation, symptoms, interactive FAQ accordion)
├── contactus.html               # Contact Us (Address, phone, hours, booking form, interactive Google Map)
├── _headers                     # Cloudflare Pages security & caching headers
├── _redirects                   # Clean URL routing for Cloudflare Pages (/aboutus -> /aboutus.html)
├── css/
│   └── style.css                # Core design system, automotive colors, responsive layouts
├── js/
│   └── main.js                  # Live opening hours logic, mobile menu, FAQ accordion, form AJAX
├── functions/
│   └── api/
│       └── contact.js           # Serverless Cloudflare Pages Function (/api/contact)
└── assets/
    ├── images/                  # High-res garage & mechanic imagery (cutouts, background banners, logo)
    └── icons/                   # Automotive service icons (MOT, brakes, exhausts, batteries, DPF, etc.)
```

---

## 🚀 How to Deploy on Cloudflare Pages

### Option 1: Automatic Deployment via GitHub (Recommended)
1. Push this repository to GitHub:
   ```bash
   git add .
   git commit -m "Initial commit of BK MOT Centre platform"
   git push -u origin main
   ```
2. Log in to [Cloudflare Dashboard](https://dash.cloudflare.com/) and go to **Workers & Pages** > **Create application** > **Pages** > **Connect to Git**.
3. Select `GeekOfProgramming/bkmotcentre`.
4. Configure Build Settings:
   * **Framework preset:** `None`
   * **Build command:** *(leave empty)*
   * **Build output directory:** `/`
5. Click **Save and Deploy**. Your website will be live worldwide in seconds with free SSL!

### Option 2: Direct Upload via Wrangler CLI
```bash
npx wrangler pages deploy . --project-name=bkmotcentre
```

---

## 📞 Business Details
* **Business:** BK MOT Centre Ltd
* **Address:** 161 Rolfe Street, Smethwick, Birmingham, B66 2AU
* **Phone:** (0121) 558 9215
* **Hours:** Open Everyday 9:00 AM – 6:00 PM
