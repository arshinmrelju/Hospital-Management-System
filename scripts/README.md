# Google Sheets API Setup

## Deploy the Apps Script

1. Go to https://script.google.com/
2. Create a **New project**
3. Delete any default code and paste the contents of `Code.gs`
4. Click **Deploy > New deployment**
5. Choose type: **Web app**
6. Settings:
   - **Execute as**: `Me`
   - **Who has access**: `Anyone` 
7. Click **Deploy**
8. Copy the **Web app URL** (looks like `https://script.google.com/macros/s/.../exec`)

## Configure the Web App

1. Open `public/js/sheets-api.js`
2. On line 3, set the URL:

```js
var SHEETS_API_URL = 'https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec';
```

## That's it

The app will now read/write patient data directly from:
- **Patients**: Your existing Google Sheet (the one with all patient records)
- **Appointments**: A new "Appointments" tab will be auto-created when the first appointment is booked

> **Note**: If you edit the Apps Script code, you must click **Deploy > Manage deployments** and create a **New version** to apply changes.
