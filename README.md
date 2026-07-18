<div align="center">
  <img src="public/assets/hms-logo.jpg" alt="Wellness Medicals Logo" width="110" height="110" style="border-radius: 18px;">

  <h1>Wellness Medicals — HMS</h1>
  <p><strong>A production-deployed, role-based Hospital Management System with a premium glassmorphic UI, Google Sheets data sync, and PWA support — hosted on Firebase.</strong></p>

  <br/>

  [![Live Demo](https://img.shields.io/badge/🌐%20Live%20Demo-wellnessplpy.web.app-blue?style=for-the-badge&logo=firebase&logoColor=white)](https://wellnessplpy.web.app)
  [![License: MIT](https://img.shields.io/badge/License-MIT-yellow?style=for-the-badge)](LICENSE)
  [![Firebase](https://img.shields.io/badge/Firebase-Hosting%20%2B%20Firestore-FFCA28?style=for-the-badge&logo=firebase&logoColor=black)](https://firebase.google.com)
  [![PWA Ready](https://img.shields.io/badge/PWA-Ready-5A0FC8?style=for-the-badge&logo=pwa&logoColor=white)](https://wellnessplpy.web.app/manifest.json)
  [![Vanilla JS](https://img.shields.io/badge/Built%20with-Vanilla%20JS-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black)](https://developer.mozilla.org/en-US/docs/Web/JavaScript)

</div>

---

## ✨ Overview

**Wellness Medicals HMS** is a production-deployed, multi-role hospital management system handling clinical and administrative workflows. It is built entirely with Vanilla HTML/CSS/JavaScript on the frontend, uses **Firebase Firestore** for real-time session auditing, and integrates **Google Sheets** as the primary data source for patient records, appointments, and pharmacy inventory.

The system features the **VitalGlass** design language — a custom glassmorphic UI system with ambient gradients, frosted surfaces, and micro-animations — delivered as a responsive, offline-capable **Progressive Web App**.

> 🌐 **Live:** [https://wellnessplpy.web.app](https://wellnessplpy.web.app)

---

## 📋 Features

### 🏥 Role-Based Portals

Five distinct portals, each with a dedicated accent colour and tailored interface:

| Portal | Accent | Key Responsibilities |
|---|---|---|
| **Reception** | Violet `#7C3AED` | OPD check-in, patient registration, appointment queue |
| **Admin** | Blue `#2563EB` | Staff management, system metrics, audit logs, live session monitoring |
| **Doctor** | Teal `#0D9488` | Consultations, patient history, e-prescriptions *(roadmap)* |
| **Pharmacist** | Amber `#D97706` | Drug inventory, dispensing, purchase requisitions *(roadmap)* |
| **Lab Tech** | Rose `#E11D48` | Test orders, results, printable reports *(roadmap)* |

---

### 🩺 Clinical Workflows (Reception)

- **OPD Patient Management** — Register walk-in patients with visit tracking and auto-generated token numbers
- **Appointment Scheduling** — Full CRUD calendar with real-time status tracking (confirmed / in-progress / completed / cancelled)
- **Patient Registry** — Searchable patient database backed by Google Sheets
- **Google Sheets Sync** — Bidirectional read/write integration with Google Sheets as a live structured data store

### 🔐 Admin & Security

- **Live Session Monitor** — Real-time active/expired login history via Firestore
- **Immutable Audit Log** — Session records with device info, login time, and calculated duration
- **Role-Based Access** — Credential-based portal authentication guarded by `auth-guard.js`
- **Staff & Department Management** — Personnel CRUD, role assignment, shift overview
- **System Metrics Dashboard** — Revenue trends, appointment KPIs, patient stats via Chart.js

### 📱 PWA & Offline

- **Service Worker** — Pre-caches critical assets for offline access
- **Web App Manifest** — Installable on Android, iOS, and desktop
- **Responsive** — Optimised at 768 px, 480 px, and 360 px breakpoints

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | HTML5, CSS3 (VitalGlass design system), Vanilla JavaScript |
| **Primary Data** | Google Sheets API (patients, appointments, pharmacy) |
| **Session & Audit** | Firebase Firestore (`login_history` collection) |
| **Hosting** | Firebase Hosting |
| **Charts** | Chart.js |
| **Offline** | Service Worker + PWA Manifest |
| **Typography** | Manrope (headings), Inter (body), Material Icons Round |

---

## 📁 Project Structure

```
Wellness Medicals/
├── public/                          # Static frontend root (Firebase Hosting)
│   ├── index.html                   # Reception portal (OPD, appointments, patients)
│   ├── admin.html                   # Admin portal (metrics, staff, sessions)
│   ├── patients.html                # Standalone patient management view
│   ├── developer.html               # Developer / debug panel
│   ├── offline.html                 # PWA offline fallback page
│   ├── import.html                  # Bulk data import utility
│   ├── manifest.json                # PWA manifest
│   ├── service-worker.js            # Offline caching strategy
│   ├── assets/
│   │   └── hms-logo.jpg             # Application logo
│   ├── css/
│   │   ├── main.css                 # VitalGlass core design system
│   │   ├── layout.css               # Sidebar, topbar, page shell
│   │   ├── administration.css       # Admin portal styles
│   │   ├── patients.css             # Patient management styles
│   │   ├── portals.css              # Role portal themes
│   │   └── staff-theme.css          # Staff accent overrides
│   └── js/
│       ├── firebase-init.js         # Firebase SDK initialisation
│       ├── sheets-api.js            # Google Sheets API integration layer
│       ├── app.js                   # Reception portal controller
│       ├── admin.js                 # Admin portal controller
│       ├── patients.js              # Patient management controller
│       ├── reception-dashboard.js   # Reception dashboard metrics
│       ├── skin.js                  # Dermatology / skin clinic module
│       ├── ortho.js                 # Orthopaedics module
│       ├── developer.js             # Developer panel logic
│       └── pwa.js                   # PWA install prompt handler
├── firestore.rules                  # Firestore security rules
├── firestore.indexes.json           # Firestore composite indexes
├── firebase.json                    # Firebase Hosting & Firestore config
├── .firebaserc                      # Firebase project binding (wellnessplpy)
├── .gitignore
├── LICENSE
└── README.md
```

---

## 🚀 Getting Started

### Prerequisites

- A modern web browser (Chrome, Edge, Firefox)
- A Google Cloud project with **Google Sheets API** enabled and a valid API key
- A Firebase project with **Hosting** and **Firestore** enabled

### Setup

1. **Clone the repository**
   ```bash
   git clone https://github.com/arshinmrelju/HMS.git
   cd HMS
   ```

2. **Configure Firebase** — update `public/js/firebase-init.js`:
   ```js
   const firebaseConfig = {
     apiKey: "YOUR_API_KEY",
     authDomain: "YOUR_PROJECT.firebaseapp.com",
     projectId: "YOUR_PROJECT_ID",
     storageBucket: "YOUR_PROJECT.appspot.com",
     messagingSenderId: "YOUR_SENDER_ID",
     appId: "YOUR_APP_ID"
   };
   ```

3. **Configure Google Sheets** — update `public/js/sheets-api.js`:
   ```js
   const SHEETS_API_KEY  = "YOUR_GOOGLE_API_KEY";
   const SPREADSHEET_ID  = "YOUR_SPREADSHEET_ID";
   ```

4. **Deploy to Firebase Hosting**
   ```bash
   npx -y firebase-tools@latest deploy
   ```

   Or serve locally:
   ```bash
   npx -y firebase-tools@latest serve --only hosting
   # Open http://localhost:5000
   ```

---

## 🎨 Design System: VitalGlass

| Token | Details |
|---|---|
| **Frosted Surfaces** | `backdrop-filter: blur()` with layered RGBA opacity |
| **Ambient Lighting** | Animated gradient orbs in the page background |
| **Micro-Interactions** | Hover lifts, ripple effects, smooth state transitions |
| **Role Accents** | Per-portal accent colour injected via CSS custom properties |
| **Typography** | Manrope (headings) + Inter (body) via Google Fonts |
| **Icons** | Material Icons Round |
| **Responsive** | Breakpoints at 768 px, 480 px, 360 px |

---

## 🔒 Firestore Data Model

Firestore is used for **session auditing only** via the `login_history` collection.

| Field | Type | Description |
|---|---|---|
| `userId` | `string` | Anonymous session identifier |
| `user` | `string` | Display name (e.g. `"Admin"`) |
| `role` | `string` | `"Admin"` \| `"Reception"` |
| `portal` | `string` | `"admin"` \| `"reception"` |
| `loginTime` | `timestamp` | Session start |
| `lastActivity` | `timestamp` | Last user interaction |
| `status` | `string` | `"active"` \| `"expired"` \| `"logged_out"` |
| `deviceInfo` | `string` | `navigator.userAgent` |
| `sessionDuration` | `number \| null` | Duration in ms (null while active) |

Security rules enforce field-level validation on **create** and **update**, and permanently **deny deletes**.

---

## 📈 Roadmap

- [ ] Doctor portal — consultation workspace & e-prescriptions
- [ ] Pharmacist portal — drug inventory & dispensing
- [ ] Lab Tech portal — test orders & printable reports
- [ ] Firebase Authentication (replace credential-based login)
- [ ] Push notifications via FCM
- [ ] PDF invoice & report generation

---

## 🤝 Contributing

Contributions are welcome!

1. Fork the repository
2. Create your feature branch: `git checkout -b feature/my-feature`
3. Commit your changes: `git commit -m 'feat: add my feature'`
4. Push: `git push origin feature/my-feature`
5. Open a Pull Request

Please follow [Conventional Commits](https://www.conventionalcommits.org/) for commit messages.

---

## 📄 License

Distributed under the **MIT License**. See [`LICENSE`](LICENSE) for details.

---

<div align="center">
  <sub>Built with the VitalGlass design system &middot; Deployed on Firebase &middot; &copy; 2025 Wellness Medicals</sub>
</div>

